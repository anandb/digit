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

  private initializeState(): DiagramState {
    const loadedDiagram = this.loadFromSession();
    if (loadedDiagram) {
      return {
        currentDiagram: loadedDiagram,
        diagramStack: [],
        selectedNodeId: undefined,
        selectedTendrilId: undefined
      };
    }
    return {
      currentDiagram: this.createEmptyDiagram(),
      diagramStack: [],
      selectedNodeId: undefined,
      selectedTendrilId: undefined
    };
  }

  private get state(): DiagramState {
    return this.stateSubject.value;
  }

  private set state(newState: DiagramState) {
    this.stateSubject.next(newState);
    // Always save from the root diagram for session storage
    const rootDiagram = newState.diagramStack.length > 0
      ? newState.diagramStack[0]
      : newState.currentDiagram;
    this.saveToSession(rootDiagram);
  }

  private createEmptyDiagram(): Diagram {
    return {
      id: this.generateId(),
      name: 'New Diagram',
      nodes: [],
      edges: [],
      attributes: {}
    };
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
        currentDiagram: node.innerDiagram
      };
    }
  }

  createInnerDiagram(nodeId: string): void {
    const newDiagram: Diagram = {
      id: this.generateId(),
      name: 'Inner Diagram',
      nodes: [],
      edges: [],
      attributes: {}
    };

    this.updateNode(nodeId, { innerDiagram: newDiagram });
  }

  goBack(): void {
    if (this.state.diagramStack.length > 0) {
      const previousDiagram = this.state.diagramStack[this.state.diagramStack.length - 1];
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

    this.state = {
      ...this.state,
      currentDiagram: {
        ...this.state.currentDiagram,
        nodes: [...this.state.currentDiagram.nodes, newNode]
      }
    };
  }

  updateNode(nodeId: string, updates: Partial<Node>): void {
    this.state = {
      ...this.state,
      currentDiagram: {
        ...this.state.currentDiagram,
        nodes: this.state.currentDiagram.nodes.map(node =>
          node.id === nodeId ? { ...node, ...updates } : node
        )
      }
    };
  }

  deleteNode(nodeId: string): void {
    this.state = {
      ...this.state,
      currentDiagram: {
        ...this.state.currentDiagram,
        nodes: this.state.currentDiagram.nodes.filter(node => node.id !== nodeId),
        edges: this.state.currentDiagram.edges.filter(edge =>
          edge.fromNodeId !== nodeId && edge.toNodeId !== nodeId
        )
      }
    };
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

      // Remove edges connected to this tendril
      this.state = {
        ...this.state,
        currentDiagram: {
          ...this.state.currentDiagram,
          edges: this.state.currentDiagram.edges.filter(edge =>
            !(edge.fromNodeId === nodeId && edge.fromTendrilId === tendrilId) &&
            !(edge.toNodeId === nodeId && edge.toTendrilId === tendrilId)
          )
        }
      };
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

      this.state = {
        ...this.state,
        currentDiagram: {
          ...this.state.currentDiagram,
          edges: [...this.state.currentDiagram.edges, newEdge]
        }
      };
    }
  }

  deleteEdge(edgeId: string): void {
    this.state = {
      ...this.state,
      currentDiagram: {
        ...this.state.currentDiagram,
        edges: this.state.currentDiagram.edges.filter(edge => edge.id !== edgeId)
      }
    };
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
      selectedTendrilId: undefined
    };
  }

  selectTendril(nodeId: string, tendrilId: string | undefined): void {
    this.state = {
      ...this.state,
      selectedNodeId: nodeId,
      selectedTendrilId: tendrilId
    };
  }

  // Session storage methods
  private saveToSession(rootDiagram: Diagram): void {
    // Only save to session storage if we're in a browser environment
    if (typeof window !== 'undefined' && window.sessionStorage) {
      try {
        // Recursively save all nested diagrams for session storage
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
        sessionStorage.setItem('diagram-app-data', JSON.stringify(diagramToSave));
      } catch (error) {
        console.warn('Failed to save to session storage:', error);
      }
    }
  }

  private loadFromSession(): Diagram | null {
    // Only load from session storage if we're in a browser environment
    if (typeof window !== 'undefined' && window.sessionStorage) {
      try {
        const data = sessionStorage.getItem('diagram-app-data');
        return data ? JSON.parse(data) : null;
      } catch (error) {
        console.warn('Failed to load from session storage:', error);
        return null;
      }
    }
    return null;
  }

  // Public getters
  get currentState(): DiagramState {
    return this.state;
  }
}
