import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Diagram, DiagramState, Node, Tendril, Edge, Position } from '../models/diagram.model';

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
      selectedNodeId: undefined,
      selectedTendrilId: undefined,
      selectedBoundingBoxId: undefined
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
      nodes: [],
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
    const node = this.state.currentDiagram.nodes.find(n => n.id === nodeId);
    if (node?.innerDiagram) {
      this.state = {
        ...this.state,
        diagramStack: [...this.state.diagramStack, this.state.currentDiagram],
        currentDiagram: this.allDiagrams.get(node.innerDiagram.id)!
      };
    }
  }

  createInnerDiagram(nodeId: string): Diagram {
    this.allDiagrams.set(this.state.currentDiagram.id, this.state.currentDiagram);
    const newDiagram: Diagram = {
      id: this.generateId(),
      name: 'Inner Diagram',
      nodes: [],
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
      attributes: {}
    };

    this.state.currentDiagram.nodes.push(newNode);
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
      attributes: {}
    };

    this.state.currentDiagram.boundingBoxes = [...this.state.currentDiagram.boundingBoxes, newBoundingBox];
  }

  updateBoundingBox(boundingBoxId: string, updates: Partial<import('../models/diagram.model').BoundingBox>): void {
    this.state.currentDiagram.boundingBoxes = this.state.currentDiagram.boundingBoxes.map(box =>
      box.id === boundingBoxId ? { ...box, ...updates } : box
    );
  }

  deleteBoundingBox(boundingBoxId: string): void {
    this.state.currentDiagram.boundingBoxes = this.state.currentDiagram.boundingBoxes.filter(box => box.id !== boundingBoxId);
  }

  updateNode(nodeId: string, updates: Partial<Node>): void {
    this.state.currentDiagram.nodes = this.state.currentDiagram.nodes.map(node =>
      node.id === nodeId ? { ...node, ...updates } : node
    );
  }

  deleteNode(nodeId: string): void {
    this.state.currentDiagram.nodes = this.state.currentDiagram.nodes.filter(node => node.id !== nodeId);
    this.state.currentDiagram.edges = this.state.currentDiagram.edges.filter(edge =>
      edge.fromNodeId !== nodeId && edge.toNodeId !== nodeId
    );
  }

  // Tendril operations
  addTendril(nodeId: string, type: 'incoming' | 'outgoing', position: Position): void {
    const newTendril: Tendril = {
      id: this.generateId(),
      name: 'New Tendril',
      position,
      type,
      exposed: false,
      attributes: {},
      borderColor: '#000000',
      borderThickness: 2
    };

    this.updateNode(nodeId, {
      tendrils: [...this.getNode(nodeId)!.tendrils, newTendril]
    });
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
    const fromTendril = this.getTendril(fromNodeId, fromTendrilId);
    const toTendril = this.getTendril(toNodeId, toTendrilId);

    if (fromTendril?.type === 'outgoing' && toTendril?.type === 'incoming') {
      const newEdge: Edge = {
        id: this.generateId(),
        fromNodeId,
        fromTendrilId,
        toNodeId,
        toTendrilId,
        attributes: {}
      };

      this.state.currentDiagram.edges.push(newEdge);
    }
  }

  deleteEdge(edgeId: string): void {
    this.state.currentDiagram.edges = this.state.currentDiagram.edges.filter(edge => edge.id !== edgeId);
  }

  // Utility methods
  getNode(nodeId: string): Node | undefined {
    return this.state.currentDiagram.nodes.find(node => node.id === nodeId);
  }

  getTendril(nodeId: string, tendrilId: string): Tendril | undefined {
    const node = this.getNode(nodeId);
    return node?.tendrils.find(tendril => tendril.id === tendrilId);
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
        nodes: diagram.nodes.map(node => ({
          ...node,
          innerDiagram: node.innerDiagram ? saveDiagramRecursively(node.innerDiagram) : undefined
        }))
      };
    };

    const diagramToSave = saveDiagramRecursively(rootDiagram);
    return JSON.stringify(diagramToSave, null, 2);
  }

  loadDiagram(jsonString: string): void {
    try {
      const diagram: Diagram = JSON.parse(jsonString);
      this.allDiagrams.set(diagram.id, diagram);
      this.state = {
        ...this.state,
        currentDiagram: diagram,
        diagramStack: []
      };
    } catch (error) {
      console.error('Failed to load diagram:', error);
    }
  }

  // Selection
  selectNode(nodeId: string | undefined): void {
    this.state = {
      ...this.state,
      selectedNodeId: nodeId,
      selectedTendrilId: undefined,
      selectedBoundingBoxId: undefined
    };
  }

  selectTendril(nodeId: string, tendrilId: string | undefined): void {
    this.state = {
      ...this.state,
      selectedNodeId: nodeId,
      selectedTendrilId: tendrilId,
      selectedBoundingBoxId: undefined
    };
  }

  selectBoundingBox(boundingBoxId: string | undefined): void {
    this.state = {
      ...this.state,
      selectedNodeId: undefined,
      selectedTendrilId: undefined,
      selectedBoundingBoxId: boundingBoxId,
      selectedEdgeId: undefined
    };
  }

  selectEdge(edgeId: string | undefined): void {
    this.state = {
      ...this.state,
      selectedNodeId: undefined,
      selectedTendrilId: undefined,
      selectedBoundingBoxId: undefined,
      selectedEdgeId: edgeId
    };
  }

  updateEdge(edgeId: string, updates: Partial<Edge>): void {
    this.state.currentDiagram.edges = this.state.currentDiagram.edges.map(edge =>
      edge.id === edgeId ? { ...edge, ...updates } : edge
    );
  }

  // Public getters
  get currentState(): DiagramState {
    return this.state;
  }
}
