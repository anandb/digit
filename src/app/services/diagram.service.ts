import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Diagram, DiagramState, Node, Tendril, Edge, Position, DiagramElement, isNode, isSvgImage, isBoundingBox } from '../models/diagram.model';

@Injectable({
  providedIn: 'root'
})
export class DiagramService {
  private readonly STORAGE_KEY = 'digit_diagram_state';
  private allDiagrams: Map<string, Diagram> = new Map();
  private undoStacks: Map<string, DiagramState[]> = new Map(); // Undo stacks per diagram

  private stateSubject = new BehaviorSubject<DiagramState>(
    this.initializeState()
  );

  public state$ = this.stateSubject.asObservable();

  private initializeState(): DiagramState {
    const savedState = this.loadStateFromStorage();
    if (savedState) {
      return savedState;
    }

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

  // Clipboard for copy-paste
  private clipboard: DiagramElement[] = [];

  constructor() { }

  private set state(newState: DiagramState) {
    // Save current state to undo stack before updating
    const currentDiagramId = this.state?.currentDiagram?.id;
    if (currentDiagramId && !this.undoStacks.has(currentDiagramId)) {
      this.undoStacks.set(currentDiagramId, []);
    }
    const undoStack = this.undoStacks.get(currentDiagramId)!;

    // Only save to undo stack if this is a meaningful change (not just selection changes)
    const isSelectionOnlyChange =
      JSON.stringify(this.state.selectedNodeIds) === JSON.stringify(newState.selectedNodeIds) &&
      this.state.selectedTendrilId === newState.selectedTendrilId &&
      JSON.stringify(this.state.selectedBoundingBoxIds) === JSON.stringify(newState.selectedBoundingBoxIds) &&
      JSON.stringify(this.state.selectedSvgImageIds) === JSON.stringify(newState.selectedSvgImageIds) &&
      JSON.stringify(this.state.selectedEdgeIds) === JSON.stringify(newState.selectedEdgeIds) &&
      this.state.diagramStack.length === newState.diagramStack.length;

    if (!isSelectionOnlyChange) {
      // Deep clone the current state for undo
      undoStack.push(JSON.parse(JSON.stringify(this.state)));
      // Limit undo stack size to prevent memory issues
      if (undoStack.length > 50) {
        undoStack.shift();
      }
    }

    this.stateSubject.next(newState);
    this.saveStateToStorage(newState);
  }

  private createEmptyDiagram(): Diagram {
    const emptyDiagram = {
      id: this.generateId(),
      name: 'New Diagram',
      elements: [],
      edges: [],
      boundingBoxes: [],
      attributes: {},
      todos: []
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
      attributes: {},
      todos: []
    };

    this.allDiagrams.set(newDiagram.id, newDiagram);
    this.updateNode(nodeId, { innerDiagram: newDiagram });

    return newDiagram;
  }

  goBack(): void {
    if (this.state.diagramStack.length > 0) {
      // Check if current diagram is empty
      const current = this.state.currentDiagram;
      const isEmpty = current.elements.length === 0 &&
        current.edges.length === 0 &&
        current.boundingBoxes.length === 0;

      const previousDiagramId = this.state.diagramStack[this.state.diagramStack.length - 1].id;
      let previousDiagram = this.allDiagrams.get(previousDiagramId)!;

      if (isEmpty) {
        // Find parent node in previous diagram
        const parentNode = previousDiagram.elements.find(el => isNode(el) && el.innerDiagram?.id === current.id) as Node | undefined;

        if (parentNode) {
          // Remove innerDiagram from parent node
          const updatedElements = previousDiagram.elements.map(el => {
            if (el.id === parentNode.id) {
              const node = el as Node;
              return { ...node, innerDiagram: undefined };
            }
            return el;
          });

          previousDiagram = {
            ...previousDiagram,
            elements: updatedElements
          };

          this.allDiagrams.set(previousDiagram.id, previousDiagram);
          this.allDiagrams.delete(current.id);
        }
      }

      this.state = {
        ...this.state,
        currentDiagram: previousDiagram,
        diagramStack: this.state.diagramStack.slice(0, -1)
      };
    }
  }

  // Node operations
  addNode(position: Position, options?: { shape?: string; borderColor?: string; fillColor?: string; dotted?: boolean; fontFamily?: string }): void {
    const shape = (options?.shape as any) || 'rectangle';

    let size = { width: 100, height: 60 };
    if (shape === 'verticalLine') {
      size = { width: 40, height: 100 };
    } else if (shape === 'horizontalLine') {
      size = { width: 100, height: 40 };
    }

    const newNode: Node = {
      id: this.generateId(),
      label: (shape === 'verticalLine' || shape === 'horizontalLine') ? '' :
             (shape === 'numberedCircle' ? '1' : 'New Node'),
      position,
      size,
      tendrils: [],
      attributes: {},
      notes: '',
      shape: shape,
      borderColor: options?.borderColor || '#000000',
      fillColor: options?.fillColor || (shape === 'note' ? '#fff9c4' : '#ffffff'),
      dotted: options?.dotted || false,
      fontFamily: options?.fontFamily || 'Purisa, Chalkboard',
      fontSize: 14,
      fontWeight: 'normal',
      fontStyle: 'normal',
      strokeWidth: 1
    };

    console.log(this.state);
    this.state.currentDiagram.elements.push(newNode);
  }

  updateAllNodesFont(fontFamily: string): void {
    // Update all nodes in the current diagram
    this.state.currentDiagram.elements = this.state.currentDiagram.elements.map(element => {
      if (isNode(element)) {
        return { ...element, fontFamily };
      }
      return element;
    });

    // Also need to trigger state update deeply for undo stack if we want this undoable
    // The simple assignment above mutates the array but we need to re-emit state
    this.state = {
      ...this.state
    };
  }

  // Bounding box operations
  addBoundingBox(position: Position): void {
    const newBoundingBox: import('../models/diagram.model').BoundingBox = {
      id: this.generateId(),
      label: 'Group',
      position,
      size: { width: 200, height: 150 },
      attributes: {},
      notes: '',
      tendrils: [],
      fillColor: '#ffff0044',
      borderColor: '#666666',
      rounded: false,
      fontFamily: 'Purisa, Chalkboard',
      fontSize: 14,
      fontWeight: 'bold',
      fontStyle: 'normal',
      strokeWidth: 1
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

    // Position around the upper-center of the canvas
    const position = {
      x: 350 + (Math.random() * 50),
      y: 150 + (Math.random() * 50)
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
    const currentState = this.state;
    const newBoundingBoxes = currentState.currentDiagram.boundingBoxes.map(box =>
      box.id === boundingBoxId ? { ...box, ...updates } : box
    );

    const nextDiagram = this.performAutoRouting({
      ...currentState.currentDiagram,
      boundingBoxes: newBoundingBoxes
    });

    this.state = {
      ...currentState,
      currentDiagram: nextDiagram
    };
  }

  updateElement(elementId: string, updates: any): void {
    const currentState = this.state;
    let updated = false;

    const newElements = currentState.currentDiagram.elements.map(element => {
      if (element.id === elementId) {
        updated = true;
        if (isSvgImage(element) && updates.size) {
          const parser = new DOMParser();
          const svgDoc = parser.parseFromString(element.svgContent, 'image/svg+xml');
          const svgElement = svgDoc.documentElement;
          svgElement.setAttribute('width', updates.size.width.toString());
          svgElement.setAttribute('height', updates.size.height.toString());
          const serializer = new XMLSerializer();
          const updatedSvg = { ...element, ...updates };
          updatedSvg.svgContent = serializer.serializeToString(svgElement);
          return updatedSvg;
        }
        return { ...element, ...updates };
      }
      return element;
    });

    let newBoundingBoxes = currentState.currentDiagram.boundingBoxes;
    if (!updated) {
      newBoundingBoxes = currentState.currentDiagram.boundingBoxes.map(box => {
        if (box.id === elementId) {
          updated = true;
          return { ...box, ...updates };
        }
        return box;
      });
    }

    if (updated) {
      const nextDiagram = this.performAutoRouting({
        ...currentState.currentDiagram,
        elements: newElements,
        boundingBoxes: newBoundingBoxes
      });

      this.state = {
        ...currentState,
        currentDiagram: nextDiagram
      };
    }
  }

  updateElementProperty(elementId: string, property: string, value: any): void {
    this.updateElement(elementId, { [property]: value });
  }

  updateTendrilNotes(tendrilId: string, notes: string): void {
    const currentState = this.state;
    const newElements = currentState.currentDiagram.elements.map(element => {
      if (element.tendrils.some(t => t.id === tendrilId)) {
        return {
          ...element,
          tendrils: element.tendrils.map(t => t.id === tendrilId ? { ...t, notes } : t)
        };
      }
      return element;
    });

    this.state = {
      ...currentState,
      currentDiagram: {
        ...currentState.currentDiagram,
        elements: newElements
      }
    };
  }

  updateTendrilExposed(tendrilId: string, exposed: boolean): void {
    const currentState = this.state;
    const newElements = currentState.currentDiagram.elements.map(element => {
      if (element.tendrils.some(t => t.id === tendrilId)) {
        return {
          ...element,
          tendrils: element.tendrils.map(t => t.id === tendrilId ? { ...t, exposed } : t)
        };
      }
      return element;
    });

    this.state = {
      ...currentState,
      currentDiagram: {
        ...currentState.currentDiagram,
        elements: newElements
      }
    };
  }

  updateEdgeProperty(edgeId: string, property: string, value: any): void {
    const currentState = this.state;
    const newEdges = currentState.currentDiagram.edges.map(edge => {
        if (edge.id === edgeId) {
          const topLevelProps = ['notes', 'name', 'borderColor', 'dotted', 'strokeWidth', 'fontFamily', 'fontSize', 'fontWeight', 'fontStyle'];
          if (topLevelProps.includes(property)) {
            return { ...edge, [property]: value };
          }
          return {
            ...edge,
            attributes: {
              ...edge.attributes,
              [property]: value
            }
          };
        }
      return edge;
    });

    this.state = {
      ...currentState,
      currentDiagram: {
        ...currentState.currentDiagram,
        edges: newEdges
      }
    };
  }

  updateSvgImage(svgImageId: string, updates: Partial<import('../models/diagram.model').SvgImage>): void {
    this.updateElement(svgImageId, updates);
  }

  deleteBoundingBox(boundingBoxId: string): void {
    const currentState = this.state;
    this.state = {
      ...currentState,
      currentDiagram: {
        ...currentState.currentDiagram,
        boundingBoxes: currentState.currentDiagram.boundingBoxes.filter(box => box.id !== boundingBoxId)
      }
    };
  }

  updateNode(nodeId: string, updates: Partial<Node>): void {
    this.updateElement(nodeId, updates);
  }

  deleteNode(nodeId: string): void {
    const currentState = this.state;
    this.state = {
      ...currentState,
      currentDiagram: {
        ...currentState.currentDiagram,
        elements: currentState.currentDiagram.elements.filter(element => element.id !== nodeId),
        edges: currentState.currentDiagram.edges.filter(edge =>
          edge.fromNodeId !== nodeId && edge.toNodeId !== nodeId
        )
      }
    };
  }

  // Tendril operations
  addTendril(elementId: string, type: 'incoming' | 'outgoing', position: Position): string {
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

    const currentState = this.state;
    const newElements = currentState.currentDiagram.elements.map(element => {
      if (element.id === elementId) {
        return {
          ...element,
          tendrils: [...element.tendrils, newTendril]
        };
      }
      return element;
    });

    this.state = {
      ...currentState,
      currentDiagram: {
        ...currentState.currentDiagram,
        elements: newElements
      }
    };

    return newTendril.id;
  }

  updateTendril(elementId: string, tendrilId: string, updates: Partial<Tendril>): void {
    const element = this.getElement(elementId);
    if (element) {
      this.updateElement(elementId, {
        tendrils: element.tendrils.map(tendril =>
          tendril.id === tendrilId ? { ...tendril, ...updates } : tendril
        )
      });
    }
  }

  deleteTendril(elementId: string, tendrilId: string): void {
    const element = this.getElement(elementId);
    if (element) {
      this.updateElement(elementId, {
        tendrils: element.tendrils.filter(t => t.id !== tendrilId)
      });
      this.state.currentDiagram.edges = this.state.currentDiagram.edges.filter(edge =>
        !(edge.fromNodeId === elementId && edge.fromTendrilId === tendrilId) &&
        !(edge.toNodeId === elementId && edge.toTendrilId === tendrilId)
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
        borderColor: '#666666',
        strokeWidth: 1,
        dotted: false,
        name: '',
        fontFamily: 'Purisa, Chalkboard',
        fontSize: 12,
        fontWeight: 'normal',
        fontStyle: 'normal',
        attributes: {},
        notes: ''
      };

      const currentState = this.state;
      const nextDiagram = this.performAutoRouting({
        ...currentState.currentDiagram,
        edges: [...currentState.currentDiagram.edges, newEdge]
      });

      this.state = {
        ...currentState,
        currentDiagram: nextDiagram
      };
    }
  }

  deleteEdge(edgeId: string): void {
    const currentState = this.state;
    this.state = {
      ...currentState,
      currentDiagram: {
        ...currentState.currentDiagram,
        edges: currentState.currentDiagram.edges.filter(edge => edge.id !== edgeId)
      }
    };
  }

  // Utility methods
  getElement(elementId: string): DiagramElement | undefined {
    // Search in elements (nodes, svg images)
    const element = this.state.currentDiagram.elements.find(e => e.id === elementId);
    if (element) return element;

    // Search in bounding boxes
    return this.state.currentDiagram.boundingBoxes.find(b => b.id === elementId);
  }

  getNode(nodeId: string): Node | undefined {
    const element = this.getElement(nodeId);
    return element && isNode(element) ? element : undefined;
  }

  getTendril(nodeId: string, tendrilId: string): Tendril | undefined {
    const node = this.getNode(nodeId);
    return node?.tendrils?.find(tendril => tendril.id === tendrilId);
  }

  getTendrilAny(elementId: string, tendrilId: string): Tendril | undefined {
    // First try to find the element directly in the unified elements array
    const element = this.getElement(elementId);
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

  getTendrilById(tendrilId: string): Tendril | undefined {
    for (const element of this.state.currentDiagram.elements) {
      const regularTendril = element.tendrils.find(t => t.id === tendrilId);
      if (regularTendril) return regularTendril;

      if (isNode(element) && element.innerDiagram && tendrilId.includes('-')) {
        const propagatedTendrils = this.getExposedTendrilsFromInnerDiagram(element.id);
        const propagatedTendril = propagatedTendrils.find(t => t.id === tendrilId);
        if (propagatedTendril) return propagatedTendril;
      }
    }
    return undefined;
  }

  getSvgImage(svgImageId: string): import('../models/diagram.model').SvgImage | undefined {
    const element = this.getElement(svgImageId);
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

    const diagramToSave = this.prepareDiagramForSave(rootDiagram);
    return JSON.stringify(diagramToSave, null, 2);
  }

  loadDiagram(jsonString: string): void {
    try {
      const diagram: Diagram = JSON.parse(jsonString);

      // Recursively store all diagrams in the allDiagrams map
      this.storeDiagramsRecursively(diagram);

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
  selectElement(elementId: string | undefined, multiSelect: boolean = false): void {
    if (!elementId) {
      this.clearSelection();
      return;
    }

    const element = this.getElement(elementId);
    if (!element) return;

    if (isNode(element)) {
      this.selectNode(elementId, multiSelect);
    } else if (isSvgImage(element)) {
      this.selectSvgImage(elementId, multiSelect);
    }
  }

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

  selectAll(): void {
    const allNodeIds = this.state.currentDiagram.elements.filter(isNode).map(e => e.id);
    const allSvgImageIds = this.state.currentDiagram.elements.filter(isSvgImage).map(e => e.id);
    const allBoxIds = this.state.currentDiagram.boundingBoxes.map(b => b.id);
    const allEdgeIds = this.state.currentDiagram.edges.map(e => e.id);

    this.state = {
      ...this.state,
      selectedNodeIds: allNodeIds,
      selectedSvgImageIds: allSvgImageIds,
      selectedBoundingBoxIds: allBoxIds,
      selectedEdgeIds: allEdgeIds,
      selectedTendrilId: undefined
    };
  }

  updateEdge(edgeId: string, updates: Partial<Edge>): void {
    this.state.currentDiagram.edges = this.state.currentDiagram.edges.map(edge =>
      edge.id === edgeId ? { ...edge, ...updates } : edge
    );
  }

  // Todo operations - always operate on the root diagram
  private getRootDiagram(state: DiagramState): Diagram {
    return state.diagramStack.length > 0 ? state.diagramStack[0] : state.currentDiagram;
  }

  private updateRootTodos(newTodos: import('../models/diagram.model').TodoItem[]): void {
    if (this.state.diagramStack.length > 0) {
      // Update root diagram in stack
      const updatedRoot = { ...this.state.diagramStack[0], todos: newTodos };
      const newStack = [updatedRoot, ...this.state.diagramStack.slice(1)];

      this.state = {
        ...this.state,
        diagramStack: newStack
      };
    } else {
      // Update current diagram (which is root)
      this.state = {
        ...this.state,
        currentDiagram: {
          ...this.state.currentDiagram,
          todos: newTodos
        }
      };
    }
  }

  addTodo(text: string): void {
    const rootDiagram = this.getRootDiagram(this.state);
    const newTodo: import('../models/diagram.model').TodoItem = {
      id: this.generateId(),
      text,
      completed: false
    };

    const newTodos = [...(rootDiagram.todos || []), newTodo];
    this.updateRootTodos(newTodos);
  }

  deleteTodo(todoId: string): void {
    const rootDiagram = this.getRootDiagram(this.state);
    const newTodos = (rootDiagram.todos || []).filter(t => t.id !== todoId);
    this.updateRootTodos(newTodos);
  }

  toggleTodo(todoId: string): void {
    const rootDiagram = this.getRootDiagram(this.state);
    const newTodos = (rootDiagram.todos || []).map(t =>
      t.id === todoId ? { ...t, completed: !t.completed } : t
    );
    this.updateRootTodos(newTodos);
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

  // Undo functionality
  undo(): boolean {
    const currentDiagramId = this.state.currentDiagram.id;
    const undoStack = this.undoStacks.get(currentDiagramId);

    if (!undoStack || undoStack.length === 0) {
      return false; // Nothing to undo
    }

    // Restore the previous state
    const previousState = undoStack.pop()!;
    this.stateSubject.next(previousState);
    return true;
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
          allInnerTendrils.push({
            ...tendril,
            id: `${prefix}-${tendril.id}`, // Prefix with element ID to avoid conflicts
            name: tendril.name, // Use original tendril name without prefix
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

  // Persistence Helpers
  private saveStateToStorage(state: DiagramState): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const rootDiagram = state.diagramStack.length > 0
        ? state.diagramStack[0]
        : state.currentDiagram;

      const serializedRoot = this.prepareDiagramForSave(rootDiagram);

      const serializedState = {
        rootDiagram: serializedRoot,
        currentDiagramId: state.currentDiagram.id,
        diagramStackIds: state.diagramStack.map(d => d.id),
        selectedNodeIds: state.selectedNodeIds,
        selectedTendrilId: state.selectedTendrilId,
        selectedBoundingBoxIds: state.selectedBoundingBoxIds,
        selectedSvgImageIds: state.selectedSvgImageIds,
        selectedEdgeIds: state.selectedEdgeIds
      };

      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(serializedState));
    } catch (error) {
      console.error('Failed to save state to localStorage:', error);
    }
  }

  private loadStateFromStorage(): DiagramState | null {
    if (typeof localStorage === 'undefined') return null;
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (!stored) return null;

      const serialized = JSON.parse(stored);
      if (!serialized.rootDiagram) return null;

      // Ensure allDiagrams is initialized
      if (!this.allDiagrams) {
        this.allDiagrams = new Map();
      } else {
        this.allDiagrams.clear();
      }

      this.storeDiagramsRecursively(serialized.rootDiagram);

      // Reconstruct stack
      const diagramStack = (serialized.diagramStackIds || [])
        .map((id: string) => this.allDiagrams.get(id))
        .filter((d: Diagram | undefined): d is Diagram => !!d);

      // Current diagram
      // If currentDiagramId is not found (shouldn't happen), fallback to root
      const currentDiagram = this.allDiagrams.get(serialized.currentDiagramId) || this.allDiagrams.get(serialized.rootDiagram.id);

      if (!currentDiagram) return null;

      return {
        currentDiagram,
        diagramStack,
        selectedNodeIds: serialized.selectedNodeIds || [],
        selectedTendrilId: serialized.selectedTendrilId,
        selectedBoundingBoxIds: serialized.selectedBoundingBoxIds || [],
        selectedSvgImageIds: serialized.selectedSvgImageIds || [],
        selectedEdgeIds: serialized.selectedEdgeIds || []
      };
    } catch (error) {
      console.error('Failed to load state from localStorage:', error);
      return null;
    }
  }

  // Copy-Paste Functionality
  copySelection(): void {
    const selectedElements: DiagramElement[] = [];

    // Collect selected nodes
    this.state.selectedNodeIds.forEach(id => {
      const node = this.getNode(id);
      if (node) selectedElements.push(JSON.parse(JSON.stringify(node)));
    });

    // Collect selected SVG images
    this.state.selectedSvgImageIds.forEach(id => {
      const svg = this.getSvgImage(id);
      if (svg) selectedElements.push(JSON.parse(JSON.stringify(svg)));
    });

    // Store in clipboard
    if (selectedElements.length > 0) {
      this.clipboard = selectedElements;
    }
  }

  pasteClipboard(): void {
    if (this.clipboard.length === 0) return;

    const newElements: DiagramElement[] = [];
    const newSelectedNodeIds: string[] = [];
    const newSelectedSvgImageIds: string[] = [];

    this.clipboard.forEach(element => {
      // Clone element
      const newElement = JSON.parse(JSON.stringify(element));

      // Generate new ID
      newElement.id = this.generateId();

      // Offset position
      newElement.position.x += 20;
      newElement.position.y += 20;

      // Handle specific element types
      if (isNode(newElement)) {
        // Remove inner diagram for pasted nodes
        newElement.innerDiagram = undefined;
        // Reset tendrils (we don't copy connections)
        newElement.tendrils = [];
        newSelectedNodeIds.push(newElement.id);
      } else if (isSvgImage(newElement)) {
        newSelectedSvgImageIds.push(newElement.id);
      }

      newElements.push(newElement);
    });

    // Add new elements to current diagram
    this.state = {
      ...this.state,
      currentDiagram: {
        ...this.state.currentDiagram,
        elements: [...this.state.currentDiagram.elements, ...newElements]
      },
      // Select the pasted elements
      selectedNodeIds: newSelectedNodeIds,
      selectedSvgImageIds: newSelectedSvgImageIds,
      selectedBoundingBoxIds: [],
      selectedEdgeIds: [],
      selectedTendrilId: undefined
    };
  }

  private prepareDiagramForSave(diagram: Diagram): Diagram {
    return {
      ...diagram,
      elements: diagram.elements.map(element => {
        if (isNode(element)) {
          return {
            ...element,
            innerDiagram: element.innerDiagram ? this.prepareDiagramForSave(element.innerDiagram) : undefined
          };
        }
        return element;
      })
    };
  }

  private storeDiagramsRecursively(diag: Diagram): void {
    this.allDiagrams.set(diag.id, diag);
    diag.elements.forEach(element => {
      if (isNode(element) && element.innerDiagram) {
        this.storeDiagramsRecursively(element.innerDiagram);
      }
    });
  }

  // Centroid and Auto-routing Helpers
  private getCentroid(element: any): Position {
    return {
      x: element.position.x + (element.size.width / 2),
      y: element.position.y + (element.size.height / 2)
    };
  }

  private getIntersectionPoint(element: any, target: Position): Position {
    const w = element.size.width;
    const h = element.size.height;
    const cx = element.position.x + w / 2;
    const cy = element.position.y + h / 2;

    const dx = target.x - cx;
    const dy = target.y - cy;

    if (dx === 0 && dy === 0) return { x: w, y: h / 2 };

    // Circle intersection
    if ('shape' in element && element.shape === 'circle') {
       const radius = Math.min(w, h) / 2;
       const dist = Math.sqrt(dx * dx + dy * dy);
       return {
         x: (w / 2) + (dx / dist) * radius,
         y: (h / 2) + (dy / dist) * radius
       };
    }

    // Default: Box intersection (works for most shapes)
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    let scale = 1;
    if (w * absDy > h * absDx) {
      scale = (h / 2) / (absDy || 1);
    } else {
      scale = (w / 2) / (absDx || 1);
    }

    return {
      x: (w / 2) + dx * scale,
      y: (h / 2) + dy * scale
    };
  }

  private performAutoRouting(diagram: Diagram): Diagram {
    let anyChanged = false;

    // Create shallow copies of elements to avoid mutating state directly
    const elements = diagram.elements.map(e => ({
      ...e,
      tendrils: e.tendrils.map(t => ({ ...t }))
    }));

    const boxes = diagram.boundingBoxes.map(b => ({
      ...b,
      tendrils: b.tendrils.map(t => ({ ...t }))
    }));

    for (const edge of diagram.edges) {
      const fromEl = elements.find(e => e.id === edge.fromNodeId) || boxes.find(b => b.id === edge.fromNodeId);
      const toEl = elements.find(e => e.id === edge.toNodeId) || boxes.find(b => b.id === edge.toNodeId);

      if (!fromEl || !toEl) continue;

      const fromCenter = this.getCentroid(fromEl);
      const toCenter = this.getCentroid(toEl);

      const fromPos = this.getIntersectionPoint(fromEl, toCenter);
      const toPos = this.getIntersectionPoint(toEl, fromCenter);

      const updateTendril = (el: any, tid: string, pos: Position) => {
        const tendril = el.tendrils.find((t: any) => t.id === tid);
        if (tendril && (Math.abs(tendril.position.x - pos.x) > 0.05 || Math.abs(tendril.position.y - pos.y) > 0.05)) {
          tendril.position = pos;
          anyChanged = true;
        }
      };

      updateTendril(fromEl, edge.fromTendrilId, fromPos);
      updateTendril(toEl, edge.toTendrilId, toPos);
    }

    if (!anyChanged) return diagram;

    return {
      ...diagram,
      elements,
      boundingBoxes: boxes
    };
  }
}
