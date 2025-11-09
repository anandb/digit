import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Diagram, DiagramState, Node, Tendril, Edge, Position, DiagramElement, isNode, isSvgImage } from '../models/diagram.model';

@Injectable({
  providedIn: 'root'
})
export class DiagramService {
  private stateSubject = new BehaviorSubject<DiagramState>(
    this.initializeState()
  );

  public state$ = this.stateSubject.asObservable();
  private allDiagrams: Map<string, Diagram> = new Map();

  private initializeState(): DiagramState {
    return {
      currentDiagram: this.createEmptyDiagram(),
      diagramStack: [],
      selectedNodeIds: [],
      selectedTendrilId: undefined,
      selectedBoundingBoxIds: [],
      selectedSvgImageIds: [],
      selectedEdgeIds: []
    };
  }

  private get state(): DiagramState {
    return this.stateSubject.value;
  }

  private set state(newState: DiagramState) {
    this.stateSubject.next(newState);
  }

  private createEmptyDiagram(): Diagram {
    const emptyDiagram = {
      id: this.generateId(),
      name: 'New Diagram',
      elements: [],
      edges: [],
      boundingBoxes: [],
      attributes: {}
    };

    if (this.allDiagrams) {
      this.allDiagrams.set(emptyDiagram.id, emptyDiagram);
    }

    return emptyDiagram;
  }

  private generateId(): string {
    return Math.random().toString(36).substr(2, 9);
  }

  // Navigation methods
  enterNodeDiagram(nodeId: string): void {
    const element = this.state.currentDiagram.elements.find(e => e.id === nodeId);
    if (element && isNode(element) && element.innerDiagram) {
      this.state = {
        ...this.state,
        diagramStack: [...this.state.diagramStack, this.state.currentDiagram],
        currentDiagram: this.allDiagrams.get(element.innerDiagram.id)!
      };
    }
  }

  createInnerDiagram(nodeId: string): Diagram {
    this.allDiagrams.set(this.state.currentDiagram.id, this.state.currentDiagram);
    const newDiagram: Diagram = {
      id: this.generateId(),
      name: 'Inner Diagram',
      elements: [],
      edges: [],
      boundingBoxes: [],
      attributes: {}
    };

    this.allDiagrams.set(newDiagram.id, newDiagram);
    this.updateNode(nodeId, { innerDiagram: newDiagram });

    return newDiagram;
  }

  goBack(): void {
    if (this.state.diagramStack.length > 0) {
      const previousDiagram = this.allDiagrams.get(this.state.diagramStack[this.state.diagramStack.length - 1].id)!;
      this.state = {
        ...this.state,
        currentDiagram: previousDiagram,
        diagramStack: this.state.diagramStack.slice(0, -1)
      };
    }
  }

  // Node operations
  addNode(position: Position): void {
    const newNode: Node = {
      id: this.generateId(),
      name: 'New Node',
      position,
      size: { width: 100, height: 60 },
      shape: 'rectangle',
      borderColor: '#000000',
      fillColor: '#ffffff',
      tendrils: [],
      attributes: {},
      notes: ''
    };

    console.log(this.state);
    this.state.currentDiagram.elements.push(newNode);
  }

  // Bounding box operations
  addBoundingBox(position: Position): void {
    const newBoundingBox: import('../models/diagram.model').BoundingBox = {
      id: this.generateId(),
      label: 'Group',
      position,
      size: { width: 200, height: 150 },
      fillColor: 'rgba(255, 255, 0, 0.3)',
      borderColor: '#666666',
      attributes: {},
      notes: '',
      tendrils: []
    };

    this.state.currentDiagram.boundingBoxes = [...this.state.currentDiagram.boundingBoxes, newBoundingBox];
  }

  // SVG image operations
  addSvgImage(svgContent: string, fileName: string): void {
    // Parse SVG to get dimensions
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(svgContent, 'image/svg+xml');
    const svgElement = svgDoc.documentElement;

    let width = parseFloat(svgElement.getAttribute('width') || '100');
    let height = parseFloat(svgElement.getAttribute('height') || '100');

    // Scale down to be comparable to typical node size (100x60)
    // Target size should be smaller than node size for better proportion
    const targetWidth = 80;   // Smaller than typical node width
    const targetHeight = 50;  // Smaller than typical node height

    // Always scale down to target size
    const scaleX = targetWidth / width;
    const scaleY = targetHeight / height;
    const scale = Math.min(scaleX, scaleY);

    // Apply scaling to dimensions
    width *= scale;
    height *= scale;

    // Update the SVG content with scaled dimensions
    svgElement.setAttribute('width', width.toString());
    svgElement.setAttribute('height', height.toString());

    // Don't modify viewBox - let the SVG display its full content at the new size
    // The viewBox should remain as originally defined to show complete content

    // Serialize back to string
    const serializer = new XMLSerializer();
    const scaledSvgContent = serializer.serializeToString(svgElement);

    // Generate random position on canvas
    const canvasWidth = 800;
    const canvasHeight = 600;
    const margin = 50; // Keep elements away from edges

    const position = {
      x: margin + Math.random() * (canvasWidth - 2 * margin),
      y: margin + Math.random() * (canvasHeight - 2 * margin)
    };

    const newSvgImage: import('../models/diagram.model').SvgImage = {
      id: this.generateId(),
      position,
      size: { width, height },
      svgContent: scaledSvgContent,
      fileName,
      label: fileName.replace('.svg', ''), // Use filename without extension as default label
      tendrils: [],
      attributes: {},
      notes: ''
    };

    this.state.currentDiagram.elements.push(newSvgImage);
  }

  updateBoundingBox(boundingBoxId: string, updates: Partial<import('../models/diagram.model').BoundingBox>): void {
    this.state.currentDiagram.boundingBoxes = this.state.currentDiagram.boundingBoxes.map(box =>
      box.id === boundingBoxId ? { ...box, ...updates } : box
    );
  }

  updateSvgImage(svgImageId: string, updates: Partial<import('../models/diagram.model').SvgImage>): void {
    this.state.currentDiagram.elements = this.state.currentDiagram.elements.map(element => {
      if (element.id === svgImageId && isSvgImage(element)) {
        const updatedSvg = { ...element, ...updates };

        // If size is being updated, also update the SVG content dimensions
        if (updates.size) {
          const parser = new DOMParser();
          const svgDoc = parser.parseFromString(element.svgContent, 'image/svg+xml');
          const svgElement = svgDoc.documentElement;

          svgElement.setAttribute('width', updates.size.width.toString());
          svgElement.setAttribute('height', updates.size.height.toString());

          const serializer = new XMLSerializer();
          updatedSvg.svgContent = serializer.serializeToString(svgElement);
        }

        return updatedSvg;
      }
      return element;
    });
  }

  deleteBoundingBox(boundingBoxId: string): void {
    this.state.currentDiagram.boundingBoxes = this.state.currentDiagram.boundingBoxes.filter(box => box.id !== boundingBoxId);
  }

  updateNode(nodeId: string, updates: Partial<Node>): void {
    this.state.currentDiagram.elements = this.state.currentDiagram.elements.map(element => {
      if (element.id === nodeId && isNode(element)) {
        return { ...element, ...updates };
      }
      return element;
    });
  }

  deleteNode(nodeId: string): void {
    this.state.currentDiagram.elements = this.state.currentDiagram.elements.filter(element => element.id !== nodeId);
    this.state.currentDiagram.edges = this.state.currentDiagram.edges.filter(edge =>
      edge.fromNodeId !== nodeId && edge.toNodeId !== nodeId
    );
  }

  // Tendril operations
  addTendril(elementId: string, type: 'incoming' | 'outgoing', position: Position): void {
    const newTendril: Tendril = {
      id: this.generateId(),
      name: type === 'incoming' ? 'Incoming Tendril' : 'Outgoing Tendril',
      position,
      type,
      exposed: false,
      attributes: {},
      borderColor: '#000000',
      borderThickness: 2,
      notes: ''
    };

    const element = this.state.currentDiagram.elements.find(e => e.id === elementId);
    if (element) {
      element.tendrils = [...element.tendrils, newTendril];
      // Trigger state update
      this.state = { ...this.state };
    }
  }

  // Legacy methods for backward compatibility
  addTendrilToNode(nodeId: string, type: 'incoming' | 'outgoing', position: Position): void {
    this.addTendril(nodeId, type, position);
  }

  addTendrilToSvgImage(svgImageId: string, type: 'incoming' | 'outgoing', position: Position): void {
    this.addTendril(svgImageId, type, position);
  }

  updateTendril(nodeId: string, tendrilId: string, updates: Partial<Tendril>): void {
    const node = this.getNode(nodeId);
    if (node) {
      this.updateNode(nodeId, {
        tendrils: node.tendrils.map(tendril =>
          tendril.id === tendrilId ? { ...tendril, ...updates } : tendril
        )
      });
    }
  }

  updateSvgTendril(svgImageId: string, tendrilId: string, updates: Partial<Tendril>): void {
    const svgImage = this.getSvgImage(svgImageId);
    if (svgImage) {
      this.updateSvgImage(svgImageId, {
        tendrils: svgImage.tendrils.map(tendril =>
          tendril.id === tendrilId ? { ...tendril, ...updates } : tendril
        )
      });
    }
  }

  deleteTendril(nodeId: string, tendrilId: string): void {
    const node = this.getNode(nodeId);
    if (node) {
      this.updateNode(nodeId, {
        tendrils: node.tendrils.filter(t => t.id !== tendrilId)
      });
      this.state.currentDiagram.edges = this.state.currentDiagram.edges.filter(edge =>
        !(edge.fromNodeId === nodeId && edge.fromTendrilId === tendrilId) &&
        !(edge.toNodeId === nodeId && edge.toTendrilId === tendrilId)
      );
    }
  }

  // Edge operations
  addEdge(fromNodeId: string, fromTendrilId: string, toNodeId: string, toTendrilId: string): void {
    const fromTendril = this.getTendrilAny(fromNodeId, fromTendrilId);
    const toTendril = this.getTendrilAny(toNodeId, toTendrilId);

    if (fromTendril?.type === 'outgoing' && toTendril?.type === 'incoming') {
      const newEdge: Edge = {
        id: this.generateId(),
        fromNodeId,
        fromTendrilId,
        toNodeId,
        toTendrilId,
        attributes: {},
        notes: ''
      };

      this.state.currentDiagram.edges.push(newEdge);
    }
  }

  deleteEdge(edgeId: string): void {
    this.state.currentDiagram.edges = this.state.currentDiagram.edges.filter(edge => edge.id !== edgeId);
  }

  // Utility methods
  getNode(nodeId: string): Node | undefined {
    const element = this.state.currentDiagram.elements.find(element => element.id === nodeId);
    return element && isNode(element) ? element : undefined;
  }

  getTendril(nodeId: string, tendrilId: string): Tendril | undefined {
    const node = this.getNode(nodeId);
    return node?.tendrils?.find(tendril => tendril.id === tendrilId);
  }

  getTendrilAny(elementId: string, tendrilId: string): Tendril | undefined {
    // First try to find the element directly in the unified elements array
    const element = this.state.currentDiagram.elements.find(e => e.id === elementId);
    if (element) {
      // First check if it's a regular tendril on the element
      const regularTendril = element.tendrils.find(tendril => tendril.id === tendrilId);
      if (regularTendril) return regularTendril;

      // Check if it's a propagated tendril (only for nodes)
      if (isNode(element) && element.innerDiagram && tendrilId.includes('-')) {
        const propagatedTendrils = this.getExposedTendrilsFromInnerDiagram(elementId);
        return propagatedTendrils.find(t => t.id === tendrilId);
      }

      return undefined;
    }

    // For backward compatibility, check if it's an SVG image with "svg-" prefix
    if (elementId.startsWith('svg-')) {
      const svgImageId = elementId.substring(4); // Remove "svg-" prefix
      const svgImage = this.state.currentDiagram.elements.find(e => e.id === svgImageId && isSvgImage(e));
      if (svgImage && isSvgImage(svgImage)) {
        return svgImage.tendrils.find((tendril: Tendril) => tendril.id === tendrilId);
      }
    }

    return undefined;
  }

  getSvgImage(svgImageId: string): import('../models/diagram.model').SvgImage | undefined {
    const element = this.state.currentDiagram.elements.find(element => element.id === svgImageId);
    return element && isSvgImage(element) ? element : undefined;
  }

  getEdge(edgeId: string): Edge | undefined {
    return this.state.currentDiagram.edges.find(edge => edge.id === edgeId);
  }

  // Save/Load
  saveDiagram(): string {
    // Always save from the root diagram (first in the stack or current if no stack)
    const rootDiagram = this.state.diagramStack.length > 0
      ? this.state.diagramStack[0]
      : this.state.currentDiagram;

    // Recursively save all nested diagrams
    const saveDiagramRecursively = (diagram: Diagram): Diagram => {
      return {
        ...diagram,
        elements: diagram.elements.map(element => {
          if (isNode(element)) {
            return {
              ...element,
              innerDiagram: element.innerDiagram ? saveDiagramRecursively(element.innerDiagram) : undefined
            };
          }
          return element;
        })
      };
    };

    const diagramToSave = saveDiagramRecursively(rootDiagram);
    return JSON.stringify(diagramToSave, null, 2);
  }

  loadDiagram(jsonString: string): void {
    try {
      const diagram: Diagram = JSON.parse(jsonString);

      // Recursively store all diagrams in the allDiagrams map
      const storeDiagramsRecursively = (diag: Diagram): void => {
        this.allDiagrams.set(diag.id, diag);
        // Store nested diagrams
        diag.elements.forEach(element => {
          if (isNode(element) && element.innerDiagram) {
            storeDiagramsRecursively(element.innerDiagram);
          }
        });
      };

      storeDiagramsRecursively(diagram);

      this.state = {
        ...this.state,
        currentDiagram: diagram,
        diagramStack: []
      };
    } catch (error) {
      console.error('Failed to load diagram:', error);
    }
  }

  // Selection - Multi-selection support
  selectNode(nodeId: string | undefined, multiSelect: boolean = false): void {
    if (multiSelect && nodeId) {
      // Multi-select mode: toggle selection
      const currentSelections = [...this.state.selectedNodeIds];
      const index = currentSelections.indexOf(nodeId);

      if (index > -1) {
        // Already selected, remove it
        currentSelections.splice(index, 1);
      } else {
        // Not selected, add it
        currentSelections.push(nodeId);
      }

      this.state = {
        ...this.state,
        selectedNodeIds: currentSelections,
        selectedTendrilId: undefined,
        selectedBoundingBoxIds: [],
        selectedSvgImageIds: [],
        selectedEdgeIds: []
      };
    } else {
      // Single select mode: clear all other selections
      this.state = {
        ...this.state,
        selectedNodeIds: nodeId ? [nodeId] : [],
        selectedTendrilId: undefined,
        selectedBoundingBoxIds: [],
        selectedSvgImageIds: [],
        selectedEdgeIds: []
      };
    }
  }

  selectTendril(nodeId: string, tendrilId: string | undefined): void {
    this.state = {
      ...this.state,
      selectedNodeIds: nodeId ? [nodeId] : [],
      selectedTendrilId: tendrilId,
      selectedBoundingBoxIds: [],
      selectedSvgImageIds: [],
      selectedEdgeIds: []
    };
  }

  selectBoundingBox(boundingBoxId: string | undefined, multiSelect: boolean = false): void {
    if (multiSelect && boundingBoxId) {
      // Multi-select mode: toggle selection
      const currentSelections = [...this.state.selectedBoundingBoxIds];
      const index = currentSelections.indexOf(boundingBoxId);

      if (index > -1) {
        // Already selected, remove it
        currentSelections.splice(index, 1);
      } else {
        // Not selected, add it
        currentSelections.push(boundingBoxId);
      }

      this.state = {
        ...this.state,
        selectedNodeIds: [],
        selectedTendrilId: undefined,
        selectedBoundingBoxIds: currentSelections,
        selectedSvgImageIds: [],
        selectedEdgeIds: []
      };
    } else {
      // Single select mode: clear all other selections
      this.state = {
        ...this.state,
        selectedNodeIds: [],
        selectedTendrilId: undefined,
        selectedBoundingBoxIds: boundingBoxId ? [boundingBoxId] : [],
        selectedSvgImageIds: [],
        selectedEdgeIds: []
      };
    }
  }

  selectSvgImage(svgImageId: string | undefined, multiSelect: boolean = false): void {
    if (multiSelect && svgImageId) {
      // Multi-select mode: toggle selection
      const currentSelections = [...this.state.selectedSvgImageIds];
      const index = currentSelections.indexOf(svgImageId);

      if (index > -1) {
        // Already selected, remove it
        currentSelections.splice(index, 1);
      } else {
        // Not selected, add it
        currentSelections.push(svgImageId);
      }

      this.state = {
        ...this.state,
        selectedNodeIds: [],
        selectedTendrilId: undefined,
        selectedBoundingBoxIds: [],
        selectedSvgImageIds: currentSelections,
        selectedEdgeIds: []
      };
    } else {
      // Single select mode: clear all other selections
      this.state = {
        ...this.state,
        selectedNodeIds: [],
        selectedTendrilId: undefined,
        selectedBoundingBoxIds: [],
        selectedSvgImageIds: svgImageId ? [svgImageId] : [],
        selectedEdgeIds: []
      };
    }
  }

  selectEdge(edgeId: string | undefined, multiSelect: boolean = false): void {
    if (multiSelect && edgeId) {
      // Multi-select mode: toggle selection
      const currentSelections = [...this.state.selectedEdgeIds];
      const index = currentSelections.indexOf(edgeId);

      if (index > -1) {
        // Already selected, remove it
        currentSelections.splice(index, 1);
      } else {
        // Not selected, add it
        currentSelections.push(edgeId);
      }

      this.state = {
        ...this.state,
        selectedNodeIds: [],
        selectedTendrilId: undefined,
        selectedBoundingBoxIds: [],
        selectedSvgImageIds: [],
        selectedEdgeIds: currentSelections
      };
    } else {
      // Single select mode: clear all other selections
      this.state = {
        ...this.state,
        selectedNodeIds: [],
        selectedTendrilId: undefined,
        selectedBoundingBoxIds: [],
        selectedSvgImageIds: [],
        selectedEdgeIds: edgeId ? [edgeId] : []
      };
    }
  }

  // Clear all selections
  clearSelection(): void {
    this.state = {
      ...this.state,
      selectedNodeIds: [],
      selectedTendrilId: undefined,
      selectedBoundingBoxIds: [],
      selectedSvgImageIds: [],
      selectedEdgeIds: []
    };
  }

  updateEdge(edgeId: string, updates: Partial<Edge>): void {
    this.state.currentDiagram.edges = this.state.currentDiagram.edges.map(edge =>
      edge.id === edgeId ? { ...edge, ...updates } : edge
    );
  }

  updateCurrentDiagramName(name: string): void {
    // Update the current diagram name
    const updatedDiagram = { ...this.state.currentDiagram, name };

    // Update in the allDiagrams map
    this.allDiagrams.set(updatedDiagram.id, updatedDiagram);

    // If we're in a nested diagram, also update the parent node's innerDiagram reference
    if (this.state.diagramStack.length > 0) {
      const parentDiagram = this.state.diagramStack[this.state.diagramStack.length - 1];

      // Find and update the node that contains this inner diagram
      parentDiagram.elements.forEach(element => {
        if (isNode(element) && element.innerDiagram?.id === updatedDiagram.id) {
          element.innerDiagram = updatedDiagram;
        }
      });

      // Update parent diagram in allDiagrams map
      this.allDiagrams.set(parentDiagram.id, parentDiagram);
    }

    // Update the state to trigger change detection
    this.state = {
      ...this.state,
      currentDiagram: updatedDiagram
    };
  }

  // Get exposed tendrils from an inner diagram
  getExposedTendrilsFromInnerDiagram(nodeId: string): Tendril[] {
    const node = this.getNode(nodeId);
    if (!node?.innerDiagram) return [];

    const innerDiagram = this.allDiagrams.get(node.innerDiagram.id);
    if (!innerDiagram) return [];

    // Get all tendrils from all elements in the inner diagram
    const allInnerTendrils: Tendril[] = [];

    // Collect tendrils from all elements
    innerDiagram.elements.forEach(element => {
      element.tendrils.forEach(tendril => {
        if (tendril.exposed) {
          const prefix = isNode(element) ? element.id : `svg-${element.id}`;
          const namePrefix = isNode(element) ? element.name : (isSvgImage(element) ? element.label : 'Element');
          allInnerTendrils.push({
            ...tendril,
            id: `${prefix}-${tendril.id}`, // Prefix with element ID to avoid conflicts
            name: `${namePrefix}: ${tendril.name}`,
            notes: tendril.notes // Preserve notes from original tendril
          });
        }
      });
    });

    return allInnerTendrils;
  }

  // Public getters
  get currentState(): DiagramState {
    const state = this.state;
    return {
      ...state,
      // Computed properties for backward compatibility
      selectedNodeId: state.selectedNodeIds.length > 0 ? state.selectedNodeIds[state.selectedNodeIds.length - 1] : undefined,
      selectedBoundingBoxId: state.selectedBoundingBoxIds.length > 0 ? state.selectedBoundingBoxIds[state.selectedBoundingBoxIds.length - 1] : undefined,
      selectedSvgImageId: state.selectedSvgImageIds.length > 0 ? state.selectedSvgImageIds[state.selectedSvgImageIds.length - 1] : undefined,
      selectedEdgeId: state.selectedEdgeIds.length > 0 ? state.selectedEdgeIds[state.selectedEdgeIds.length - 1] : undefined
    };
  }
}
