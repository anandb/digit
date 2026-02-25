import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Diagram, DiagramState, Node, Tendril, Edge, Position, DiagramElement, isNode, isSvgImage, isBoundingBox, Group, BoundingBox, SvgImage } from '../models/diagram.model';

@Injectable({
  providedIn: 'root'
})
export class DiagramService {
  private readonly STORAGE_KEY = 'digit_diagram_state';
  private allDiagrams: Map<string, Diagram> = new Map();

  get diagrams(): Map<string, Diagram> {
    return this.allDiagrams;
  }

  // Per-diagram undo stacks: keyed by diagram ID, store Diagram content snapshots.
  // Navigation moves (entering/leaving inner diagrams) are never recorded here.
  private undoStacks: Map<string, Diagram[]> = new Map();

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
      selectedEdgeIds: [],
      selectedConnectorIds: [],
      viewportCenter: { x: 500, y: 300 }
    };
  }

  private get state(): DiagramState {
    return this.stateSubject.value;
  }

  // Clipboard for copy-paste
  private clipboard: DiagramElement[] = [];

  constructor() { }

  private nextStateSkipUndo = false;

  private set state(newState: DiagramState) {
    const prev = this.state;
    const prevDiagramId = prev?.currentDiagram?.id;
    const newDiagramId  = newState?.currentDiagram?.id;

    // Navigation (diagram switch) must never be recorded in the undo stack.
    const isNavigation = prevDiagramId !== newDiagramId;

    // Use reference equality: every content-changing operation creates a new
    // currentDiagram object via spread. Selection-only changes reuse the same
    // reference (e.g. selectNode only spreads the top-level state, not currentDiagram).
    // This is O(1) and correctly captures ALL content changes — including those
    // where selection happens to stay the same (e.g. addEdgeWithAutoTendrils).
    const diagramContentChanged = prev?.currentDiagram !== newState?.currentDiagram;

    if (!isNavigation && diagramContentChanged && prevDiagramId && !this.nextStateSkipUndo) {
      // Push a deep-clone of the current diagram onto that diagram's own undo stack.
      if (!this.undoStacks.has(prevDiagramId)) {
        this.undoStacks.set(prevDiagramId, []);
      }
      const stack = this.undoStacks.get(prevDiagramId)!;
      stack.push(JSON.parse(JSON.stringify(prev.currentDiagram)));
      if (stack.length > 50) stack.shift();
    }

    this.nextStateSkipUndo = false; // Always reset

    // Always keep allDiagrams in sync with the live current diagram so that
    // prepareDiagramForSave and getExposedTendrils always see the latest state.
    if (newState?.currentDiagram) {
      this.allDiagrams.set(newState.currentDiagram.id, newState.currentDiagram);
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
      connectors: [],
      boundingBoxes: [],
      groups: [],
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

  public recordUndoSnapshot(): void {
    const diagram = this.state.currentDiagram;
    if (diagram) {
      if (!this.undoStacks.has(diagram.id)) {
        this.undoStacks.set(diagram.id, []);
      }
      const stack = this.undoStacks.get(diagram.id)!;
      stack.push(JSON.parse(JSON.stringify(diagram)));
      if (stack.length > 50) stack.shift();
    }
  }

  // Navigation methods
  enterNodeDiagram(nodeId: string): void {
    const element = this.state.currentDiagram.elements.find(e => e.id === nodeId);
    if (element && isNode(element) && element.innerDiagram) {
      // Sync current diagram into allDiagrams so goBack() can retrieve the latest parent state
      this.allDiagrams.set(this.state.currentDiagram.id, this.state.currentDiagram);

      const innerDiagram = this.allDiagrams.get(element.innerDiagram.id)!;
      this.state = {
        ...this.state,
        diagramStack: [...this.state.diagramStack, this.state.currentDiagram],
        currentDiagram: innerDiagram
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
      connectors: [],
      boundingBoxes: [],
      groups: [],
      attributes: {},
      todos: []
    };

    this.allDiagrams.set(newDiagram.id, newDiagram);
    this.updateNode(nodeId, { innerDiagram: newDiagram });

    return newDiagram;
  }

  goBack(): void {
    if (this.state.diagramStack.length > 0) {
      // Always sync the current (inner) diagram into allDiagrams before going back
      const current = this.state.currentDiagram;
      this.allDiagrams.set(current.id, current);

      // Check if current diagram is empty
      const isEmpty = current.elements.length === 0 &&
        current.edges.length === 0 &&
        current.boundingBoxes.length === 0;

      const previousDiagramId = this.state.diagramStack[this.state.diagramStack.length - 1].id;
      let previousDiagram = this.allDiagrams.get(previousDiagramId)!;

      if (isEmpty) {
        // Find parent node in previous diagram and remove the empty innerDiagram reference
        const parentNode = previousDiagram.elements.find(el => isNode(el) && el.innerDiagram?.id === current.id) as Node | undefined;

        if (parentNode) {
          const updatedElements = previousDiagram.elements.map(el => {
            if (el.id === parentNode.id) {
              const node = el as Node;
              return { ...node, innerDiagram: undefined };
            }
            return el;
          });

          previousDiagram = { ...previousDiagram, elements: updatedElements };
          this.allDiagrams.set(previousDiagram.id, previousDiagram);
          this.allDiagrams.delete(current.id);
        }
      } else {
        // Update the parent node's embedded innerDiagram snapshot to the live current diagram
        const updatedElements = previousDiagram.elements.map(el => {
          if (isNode(el) && el.innerDiagram?.id === current.id) {
            return { ...el, innerDiagram: current } as Node;
          }
          return el;
        });

        previousDiagram = { ...previousDiagram, elements: updatedElements };
        this.allDiagrams.set(previousDiagram.id, previousDiagram);
      }

      this.state = {
        ...this.state,
        currentDiagram: previousDiagram,
        diagramStack: this.state.diagramStack.slice(0, -1)
      };
    }
  }

  deleteInnerDiagram(): void {
    if (this.state.diagramStack.length === 0) return;

    const current = this.state.currentDiagram;
    const parentDiagramInStack = this.state.diagramStack[this.state.diagramStack.length - 1];

    // Get the latest version from allDiagrams if possible, or use the one from stack
    let parentDiagram = this.allDiagrams.get(parentDiagramInStack.id) || parentDiagramInStack;

    // Find parent node in parent diagram and remove the innerDiagram reference
    const updatedElements = parentDiagram.elements.map(el => {
      if (isNode(el) && el.innerDiagram?.id === current.id) {
        return { ...el, innerDiagram: undefined } as Node;
      }
      return el;
    });

    parentDiagram = { ...parentDiagram, elements: updatedElements };
    this.allDiagrams.set(parentDiagram.id, parentDiagram);

    // Recursive delete the current diagram and all its children
    this.recursiveDeleteDiagram(current.id);

    this.state = {
      ...this.state,
      currentDiagram: parentDiagram,
      diagramStack: this.state.diagramStack.slice(0, -1)
    };
  }

  recursiveDeleteDiagram(diagramId: string): void {
    const diagram = this.allDiagrams.get(diagramId);
    if (!diagram) return;

    // Find any elements that have inner diagrams and delete them recursively
    diagram.elements.forEach(el => {
      if (isNode(el) && el.innerDiagram) {
        this.recursiveDeleteDiagram(el.innerDiagram.id);
      }
    });

    // Finally delete this diagram from the map
    this.allDiagrams.delete(diagramId);
  }

  updateViewportCenter(center: Position): void {
    this.state = {
      ...this.state,
      viewportCenter: center
    };
  }

  groupSelectedElements(): void {
    const currentState = this.state;
    const selectedIds = [
      ...currentState.selectedNodeIds,
      ...currentState.selectedSvgImageIds,
      ...currentState.selectedBoundingBoxIds
    ];

    if (selectedIds.length === 0) return;

    // Find all groups that have at least one member in the selection
    const currentGroups = currentState.currentDiagram.groups || [];
    const involvedGroups = currentGroups.filter(g =>
      g.elementIds.some(id => selectedIds.includes(id))
    );

    let targetGroupId: string;
    let finalElementIds: Set<string>;
    let finalGroups: Group[];

    if (involvedGroups.length > 0) {
      // Use the first involved group as the target
      targetGroupId = involvedGroups[0].id;

      // Collect ALL element IDs from all involved groups plus all currently selected items
      finalElementIds = new Set();
      involvedGroups.forEach(g => {
        g.elementIds.forEach(id => finalElementIds.add(id));
      });
      selectedIds.forEach(id => finalElementIds.add(id));

      // Reconstruct groups list: keep the target, remove all other involved ones
      const involvedGroupIds = involvedGroups.map(g => g.id);
      finalGroups = currentGroups.filter(g => !involvedGroupIds.includes(g.id));

      // Update the target group with all members
      const targetGroup: Group = {
        id: targetGroupId,
        elementIds: Array.from(finalElementIds)
      };
      finalGroups.push(targetGroup);
    } else {
      // No existing groups involved, create a brand new one if at least 2 are selected
      if (selectedIds.length < 2) return;

      targetGroupId = this.generateId();
      finalElementIds = new Set(selectedIds);
      const newGroup: Group = {
        id: targetGroupId,
        elementIds: selectedIds
      };
      finalGroups = [...currentGroups, newGroup];
    }

    // Update all members to point to the correct groupId
    // Check elements (nodes, svg images)
    const newElements = currentState.currentDiagram.elements.map(el => {
      if (finalElementIds.has(el.id)) {
        return { ...el, groupId: targetGroupId };
      }
      return el;
    });

    // Check bounding boxes
    const newBoundingBoxes = currentState.currentDiagram.boundingBoxes.map(box => {
      if (finalElementIds.has(box.id)) {
        return { ...box, groupId: targetGroupId };
      }
      return box;
    });

    this.state = {
      ...currentState,
      currentDiagram: {
        ...currentState.currentDiagram,
        elements: newElements,
        boundingBoxes: newBoundingBoxes,
        groups: finalGroups
      }
    };
  }

  ungroupSelectedGroups(): void {
    const currentState = this.state;
    const selectedIds = [
      ...currentState.selectedNodeIds,
      ...currentState.selectedSvgImageIds,
      ...currentState.selectedBoundingBoxIds
    ];

    // Find all groups that contain at least one selected element
    const groupsToResolve = currentState.currentDiagram.groups.filter(g =>
      g.elementIds.some(id => selectedIds.includes(id))
    );

    if (groupsToResolve.length === 0) return;

    const groupIdsToRemove = groupsToResolve.map(g => g.id);

    const newElements = currentState.currentDiagram.elements.map(el => {
      if (el.groupId && groupIdsToRemove.includes(el.groupId)) {
        return { ...el, groupId: undefined };
      }
      return el;
    });

    const newBoundingBoxes = currentState.currentDiagram.boundingBoxes.map(box => {
      if (box.groupId && groupIdsToRemove.includes(box.groupId)) {
        return { ...box, groupId: undefined };
      }
      return box;
    });

    const newGroups = currentState.currentDiagram.groups.filter(g => !groupIdsToRemove.includes(g.id));

    this.state = {
      ...currentState,
      currentDiagram: {
        ...currentState.currentDiagram,
        elements: newElements,
        boundingBoxes: newBoundingBoxes,
        groups: newGroups
      }
    };
  }

  // Node operations
  addNode(position: Position, options?: { shape?: string; borderColor?: string; fillColor?: string; dotted?: boolean; fontFamily?: string }): void {
    const shape = (options?.shape as any) || 'rectangle';

    let size = { width: 100, height: 60 };
    if (shape === 'verticalLine') {
      size = { width: 40, height: 100 };
    } else if (shape === 'horizontalLine') {
      size = { width: 100, height: 40 };
    } else if (shape === 'note' || shape === 'wall') {
      size = { width: 180, height: 180 };
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
      fillColor: options?.fillColor || (shape === 'note' ? '#fff9c4' : (shape === 'lightning' ? '#fdd835' : '#ffffff')),
      dotted: options?.dotted || false,
      fontFamily: options?.fontFamily || 'Purisa, Chalkboard',
      fontSize: 14,
      fontWeight: 'normal',
      fontStyle: 'normal',
      strokeWidth: 1,
      locked: shape === 'padlock' ? true : undefined
    };

    this.state = {
      ...this.state,
      currentDiagram: {
        ...this.state.currentDiagram,
        elements: [...this.state.currentDiagram.elements, newNode]
      }
    };
  }

  updateAllNodesFont(fontFamily: string): void {
    const currentState = this.state;
    const newElements = currentState.currentDiagram.elements.map(element => {
      if (isNode(element)) {
        return { ...element, fontFamily };
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

    this.state = {
      ...this.state,
      currentDiagram: {
        ...this.state.currentDiagram,
        boundingBoxes: [...this.state.currentDiagram.boundingBoxes, newBoundingBox]
      }
    };
  }

  // SVG image operations
  addSvgImage(svgContent: string, fileName: string, position?: Position): void {
  // Generate a unique ID for this SVG element first, so we can namespace internal IDs
  const elementId = this.generateId();

  // Parse SVG to get dimensions
  const parser = new DOMParser();
  const svgDoc = parser.parseFromString(svgContent, 'image/svg+xml');
  const svgElement = svgDoc.documentElement;

  let width = parseFloat(svgElement.getAttribute('width') || '100');
  let height = parseFloat(svgElement.getAttribute('height') || '100');

  // If no valid width/height, try to extract from viewBox
  if (!width || !height || isNaN(width) || isNaN(height)) {
    const viewBox = svgElement.getAttribute('viewBox');
    if (viewBox) {
      const parts = viewBox.split(/[\s,]+/);
      if (parts.length === 4) {
        width = parseFloat(parts[2]) || 100;
        height = parseFloat(parts[3]) || 100;
      }
    }
    if (!width || isNaN(width)) width = 100;
    if (!height || isNaN(height)) height = 100;
  }

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
  let scaledSvgContent = serializer.serializeToString(svgElement);

  // --- Namespace all internal IDs to avoid collisions when multiple SVGs are loaded ---
  // When SVGs are embedded via innerHTML, their IDs become global in the DOM.
  // If two SVGs share the same internal ID (e.g. a gradient named "a"), the first
  // definition wins for all, causing all copies to look like the first SVG.
  // Fix: collect all defined IDs and replace every occurrence with a namespaced version.
  const idPrefix = `svg-${elementId}`;
  const definedIds: string[] = [];
  const idRegex = /\bid="([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = idRegex.exec(scaledSvgContent)) !== null) {
    definedIds.push(match[1]);
  }

  if (definedIds.length > 0) {
    // Sort by length descending to prevent partial replacements (longer IDs first)
    definedIds.sort((a, b) => b.length - a.length);

    for (const id of definedIds) {
      const namespacedId = `${idPrefix}-${id}`;
      // Escape special regex chars in the original ID
      const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      // Replace id="..." declarations
      scaledSvgContent = scaledSvgContent.replace(
        new RegExp(`id="${escapedId}"`, 'g'),
        `id="${namespacedId}"`
      );
      // Replace href="#..." references
      scaledSvgContent = scaledSvgContent.replace(
        new RegExp(`href="#${escapedId}"`, 'g'),
        `href="#${namespacedId}"`
      );
      // Replace xlink:href="#..." references
      scaledSvgContent = scaledSvgContent.replace(
        new RegExp(`xlink:href="#${escapedId}"`, 'g'),
        `xlink:href="#${namespacedId}"`
      );
      // Replace url(#...) references in attributes and style values
      scaledSvgContent = scaledSvgContent.replace(
        new RegExp(`url\\(#${escapedId}\\)`, 'g'),
        `url(#${namespacedId})`
      );
    }
  }
  // --- End ID namespacing ---

  // Position: use provided or default to center-ish with subtle randomize
  const finalPosition = position || {
    x: 350 + (Math.random() * 50),
    y: 150 + (Math.random() * 50)
  };

  const newSvgImage: import('../models/diagram.model').SvgImage = {
    id: elementId,
    position: finalPosition,
    size: { width, height },
    svgContent: scaledSvgContent,
    fileName,
    label: fileName.replace('.svg', ''), // Use filename without extension as default label
    tendrils: [],
    attributes: {},
    notes: ''
  };

  this.state = {
    ...this.state,
    currentDiagram: {
      ...this.state.currentDiagram,
      elements: [...this.state.currentDiagram.elements, newSvgImage]
    }
  };
}
  updateBoundingBox(boundingBoxId: string, updates: Partial<BoundingBox>, recordUndo: boolean = true): void {
    this.updateElement(boundingBoxId, updates, recordUndo);
  }

  toggleRotation(degrees: number = 90): void {
    const currentState = this.state;
    const selectedNodes = currentState.selectedNodeIds;
    const selectedSvgs = currentState.selectedSvgImageIds;
    const allSelectedIds = [...selectedNodes, ...selectedSvgs];

    if (allSelectedIds.length === 0) return;

    const newElements = currentState.currentDiagram.elements.map(element => {
      if (allSelectedIds.includes(element.id)) {
        // Notes do not support rotation
        if ((element as any).shape === 'note') return element;
        const currentRotation = element.rotation || 0;
        return { ...element, rotation: (currentRotation + degrees) % 360 };
      }
      return element;
    });

    const nextDiagram = this.performAutoRouting({
      ...currentState.currentDiagram,
      elements: newElements
    });

    this.state = {
      ...currentState,
      currentDiagram: nextDiagram
    };
  }

  // --- Centralized AABB Geometry Logic ---
  isElementInsideBoundingBox(element: DiagramElement, boundingBox: BoundingBox): boolean {
    const elementRight = element.position.x + element.size.width;
    const elementBottom = element.position.y + element.size.height;
    const boxRight = boundingBox.position.x + boundingBox.size.width;
    const boxBottom = boundingBox.position.y + boundingBox.size.height;

    return element.position.x >= boundingBox.position.x && elementRight <= boxRight &&
           element.position.y >= boundingBox.position.y && elementBottom <= boxBottom;
  }

  isBoundingBoxInsideBoundingBox(innerBox: BoundingBox, outerBox: BoundingBox): boolean {
    const innerRight = innerBox.position.x + innerBox.size.width;
    const innerBottom = innerBox.position.y + innerBox.size.height;
    const outerRight = outerBox.position.x + outerBox.size.width;
    const outerBottom = outerBox.position.y + outerBox.size.height;

    return innerBox.position.x >= outerBox.position.x && innerRight <= outerRight &&
           innerBox.position.y >= outerBox.position.y && innerBottom <= outerBottom;
  }

  updateElement(elementId: string, updates: Partial<Node> | Partial<SvgImage> | Partial<BoundingBox>, recordUndo: boolean = true): void {
    if (!recordUndo) {
      this.nextStateSkipUndo = true;
    }
    const currentState = this.state;
    // Check elements (Nodes/SvgImages) and Bounding Boxes
    const element = currentState.currentDiagram.elements.find(e => e.id === elementId) ||
                    currentState.currentDiagram.boundingBoxes.find(b => b.id === elementId);

    // Handle grouped movement
    if (element && element.groupId && updates.position) {
      const group = currentState.currentDiagram.groups.find(g => g.id === element.groupId);
      if (group) {
        const deltaX = updates.position.x - element.position.x;
        const deltaY = updates.position.y - element.position.y;

        // Update all elements in the group
        const newElements = currentState.currentDiagram.elements.map(el => {
          if (group.elementIds.includes(el.id)) {
            const elNewPos = {
              x: el.position.x + deltaX,
              y: el.position.y + deltaY
            };
            return { ...el, position: elNewPos };
          }
          return el;
        });

        // Update all bounding boxes in the group
        const newBoundingBoxes = currentState.currentDiagram.boundingBoxes.map(box => {
          if (group.elementIds.includes(box.id)) {
            const boxNewPos = {
              x: box.position.x + deltaX,
              y: box.position.y + deltaY
            };
            return { ...box, position: boxNewPos };
          }
          return box;
        });

        this.state = {
          ...currentState,
          currentDiagram: {
            ...currentState.currentDiagram,
            elements: newElements,
            boundingBoxes: newBoundingBoxes
          }
        };
        return; // Already updated the whole group
      }
    }

    // Handle Bounding Box recursive movement (if not handled by explicit group above)
    if (element && isBoundingBox(element) && updates.position) {
      const deltaX = updates.position.x - element.position.x;
      const deltaY = updates.position.y - element.position.y;

      const newElements = currentState.currentDiagram.elements.map(el => {
        if (this.isElementInsideBoundingBox(el, element)) {
          return {
            ...el,
            position: { x: el.position.x + deltaX, y: el.position.y + deltaY }
          };
        }
        return el;
      });

      const newBoundingBoxes = currentState.currentDiagram.boundingBoxes.map(box => {
        if (box.id === element.id) {
          return { ...box, ...updates };
        }
        if (this.isBoundingBoxInsideBoundingBox(box, element)) {
          return {
            ...box,
            position: { x: box.position.x + deltaX, y: box.position.y + deltaY }
          };
        }
        return box;
      });

      this.state = {
        ...currentState,
        currentDiagram: {
          ...currentState.currentDiagram,
          elements: newElements,
          boundingBoxes: newBoundingBoxes
        }
      };
      return;
    }

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

  updateSvgImage(svgImageId: string, updates: Partial<SvgImage>, recordUndo: boolean = true): void {
    this.updateElement(svgImageId, updates, recordUndo);
  }

  deleteBoundingBox(boundingBoxId: string): void {
    const currentState = this.state;
    this.state = {
      ...currentState,
      currentDiagram: {
        ...currentState.currentDiagram,
        boundingBoxes: currentState.currentDiagram.boundingBoxes.filter(box => box.id !== boundingBoxId),
        connectors: (currentState.currentDiagram.connectors || []).filter(connector =>
          connector.fromNodeId !== boundingBoxId && connector.toNodeId !== boundingBoxId
        )
      }
    };
  }

  updateNode(nodeId: string, updates: Partial<Node>, recordUndo: boolean = true): void {
    this.updateElement(nodeId, updates, recordUndo);
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
        ),
        connectors: (currentState.currentDiagram.connectors || []).filter(connector =>
          connector.fromNodeId !== nodeId && connector.toNodeId !== nodeId
        ),
        groups: (currentState.currentDiagram.groups || [])
          .map(g => ({ ...g, elementIds: g.elementIds.filter(id => id !== nodeId) }))
          .filter(g => g.elementIds.length > 0)
      }
    };
  }

  // Semantic alias for SVG images (same logic as deleteNode — elements share one array)
  deleteSvgImage(svgImageId: string): void {
    this.deleteNode(svgImageId);
  }

  // Delete multiple elements at once (one undo entry)
  deleteElements(ids: string[]): void {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    const currentState = this.state;
    this.state = {
      ...currentState,
      currentDiagram: {
        ...currentState.currentDiagram,
        elements: currentState.currentDiagram.elements.filter(e => !idSet.has(e.id)),
        edges: currentState.currentDiagram.edges.filter(edge =>
          !idSet.has(edge.fromNodeId) && !idSet.has(edge.toNodeId)
        ),
        connectors: (currentState.currentDiagram.connectors || []).filter(connector =>
          !idSet.has(connector.fromNodeId) && !idSet.has(connector.toNodeId)
        ),
        groups: (currentState.currentDiagram.groups || [])
          .map(g => ({ ...g, elementIds: g.elementIds.filter(id => !idSet.has(id)) }))
          .filter(g => g.elementIds.length > 0)
      },
      selectedNodeIds: [],
      selectedSvgImageIds: [],
      selectedBoundingBoxIds: [],
      selectedEdgeIds: [],
      selectedConnectorIds: [],
      selectedTendrilId: undefined
    };
  }

  // Reset the entire canvas to a fresh empty diagram (proper public API replacing private stateSubject access)
  resetDiagram(): void {
    this.undoStacks.clear();
    this.allDiagrams.clear();
    this.state = {
      currentDiagram: this.createEmptyDiagram(),
      diagramStack: [],
      selectedNodeIds: [],
      selectedTendrilId: undefined,
      selectedBoundingBoxIds: [],
      selectedSvgImageIds: [],
      selectedEdgeIds: [],
      selectedConnectorIds: [],
      viewportCenter: { x: 500, y: 300 }
    };
  }

  // Tendril operations
  addTendril(elementId: string, type: 'incoming' | 'outgoing', position: Position): string {
    const newTendril: Tendril = {
      id: this.generateId(),
      name: type === 'incoming' ? 'In' : 'Out',
      position,
      type,
      exposed: false,
      exposedOverrides: {},
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

  updateTendril(elementId: string, tendrilId: string, updates: Partial<Tendril>, recordUndo: boolean = true): void {
    if (!recordUndo) {
      this.nextStateSkipUndo = true;
    }
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
      const newTendrils = element.tendrils.filter(t => t.id !== tendrilId);
      const newEdges = this.state.currentDiagram.edges.filter(edge =>
        !(edge.fromNodeId === elementId && edge.fromTendrilId === tendrilId) &&
        !(edge.toNodeId === elementId && edge.toTendrilId === tendrilId)
      );
      const newElements = this.state.currentDiagram.elements.map(el =>
        el.id === elementId ? { ...el, tendrils: newTendrils } : el
      );
      this.state = {
        ...this.state,
        currentDiagram: {
          ...this.state.currentDiagram,
          elements: newElements,
          edges: newEdges
        }
      };
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

  // Atomically creates an outgoing tendril on `fromElementId`, an incoming tendril
  // on `toElementId`, and the edge between them — a single state change so that
  // Ctrl+Z removes the entire connection in one step.
  addEdgeWithAutoTendrils(
    fromElementId: string,
    toElementId: string,
    outgoingPosition: Position,
    incomingPosition: Position
  ): void {
    const currentState = this.state;
    const diagram = currentState.currentDiagram;

    const outgoingTendril: Tendril = {
      id: this.generateId(),
      name: 'Out',
      position: outgoingPosition,
      type: 'outgoing',
      exposed: false,
      exposedOverrides: {},
      attributes: {},
      borderColor: '#000000',
      borderThickness: 2,
      notes: ''
    };

    const incomingTendril: Tendril = {
      id: this.generateId(),
      name: 'In',
      position: incomingPosition,
      type: 'incoming',
      exposed: false,
      exposedOverrides: {},
      attributes: {},
      borderColor: '#000000',
      borderThickness: 2,
      notes: ''
    };

    const newEdge: Edge = {
      id: this.generateId(),
      fromNodeId: fromElementId,
      fromTendrilId: outgoingTendril.id,
      toNodeId: toElementId,
      toTendrilId: incomingTendril.id,
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

    const newElements = diagram.elements.map(el => {
      if (el.id === fromElementId) {
        return { ...el, tendrils: [...el.tendrils, outgoingTendril] };
      }
      if (el.id === toElementId) {
        return { ...el, tendrils: [...el.tendrils, incomingTendril] };
      }
      return el;
    });

    const nextDiagram = this.performAutoRouting({
      ...diagram,
      elements: newElements,
      edges: [...diagram.edges, newEdge]
    });

    this.state = { ...currentState, currentDiagram: nextDiagram };
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

  // Connector operations
  addConnector(fromNodeId: string, toNodeId: string): void {
    const newConnector: import('../models/diagram.model').Connector = {
      id: this.generateId(),
      fromNodeId,
      toNodeId,
      borderColor: '#333333',
      strokeWidth: 1,
      dotted: true,
      startArrow: false,
      endArrow: false,
      name: '',
      fontFamily: 'Purisa, Chalkboard',
      fontSize: 12,
      fontWeight: 'normal',
      fontStyle: 'normal',
      attributes: {},
      notes: ''
    };

    const currentState = this.state;
    const currentConnectors = currentState.currentDiagram.connectors || [];
    this.state = {
      ...currentState,
      currentDiagram: {
        ...currentState.currentDiagram,
        connectors: [...currentConnectors, newConnector]
      }
    };
  }

  updateConnector(connectorId: string, updates: Partial<import('../models/diagram.model').Connector>): void {
    const currentState = this.state;
    const newConnectors = (currentState.currentDiagram.connectors || []).map(conn =>
      conn.id === connectorId ? { ...conn, ...updates } : conn
    );

    this.state = {
      ...currentState,
      currentDiagram: {
        ...currentState.currentDiagram,
        connectors: newConnectors
      }
    };
  }

  updateConnectorProperty(connectorId: string, property: string, value: any): void {
    this.updateConnector(connectorId, { [property]: value });
  }

  deleteConnector(connectorId: string): void {
    const currentState = this.state;
    this.state = {
      ...currentState,
      currentDiagram: {
        ...currentState.currentDiagram,
        connectors: (currentState.currentDiagram.connectors || []).filter(conn => conn.id !== connectorId)
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

  isTendrilExposedInDiagram(tendril: Tendril, parentDiagramId: string): boolean {
    if (tendril.exposedOverrides && tendril.exposedOverrides[parentDiagramId] !== undefined) {
      return tendril.exposedOverrides[parentDiagramId];
    }
    return tendril.exposed;
  }

  getSvgImage(svgImageId: string): import('../models/diagram.model').SvgImage | undefined {
    const element = this.getElement(svgImageId);
    return element && isSvgImage(element) ? element : undefined;
  }

  getEdge(edgeId: string): Edge | undefined {
    return this.state.currentDiagram.edges.find(edge => edge.id === edgeId);
  }

  getConnector(connectorId: string): import('../models/diagram.model').Connector | undefined {
    return this.state.currentDiagram.connectors?.find(conn => conn.id === connectorId);
  }

  // Save/Load
  saveDiagram(): string {
    // Always save from the root diagram (first in the stack or current if no stack)
    const rootDiagram = this.state.diagramStack.length > 0
      ? this.state.diagramStack[0]
      : this.state.currentDiagram;

    const diagramToSave = this.prepareDiagramForSave(rootDiagram);
    return JSON.stringify(diagramToSave, null, 4);
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

  // Unified Selection Logic
  private updateSelection(updates: Partial<DiagramState>, multiSelect: boolean): void {
    const prev = this.state;
    this.state = {
      ...prev,
      ...updates,
      // Always clear tendril selection when element selection changes, unless explicitly updating it
      selectedTendrilId: updates.hasOwnProperty('selectedTendrilId') ? updates.selectedTendrilId : undefined
    };
  }

  selectNode(nodeId: string | undefined, multiSelect: boolean = false): void {
    const state = this.state;
    if (multiSelect && nodeId) {
      const ids = this.toggleId(state.selectedNodeIds, nodeId);
      this.updateSelection({
        selectedNodeIds: ids,
        selectedNodeId: ids[ids.length - 1]
      }, true);
    } else {
      this.updateSelection({
        selectedNodeIds: nodeId ? [nodeId] : [],
        selectedNodeId: nodeId,
        selectedSvgImageIds: [],
        selectedBoundingBoxIds: [],
        selectedEdgeIds: [],
        selectedConnectorIds: []
      }, false);
    }
  }

  selectSvgImage(svgImageId: string | undefined, multiSelect: boolean = false): void {
    const state = this.state;
    if (multiSelect && svgImageId) {
      const ids = this.toggleId(state.selectedSvgImageIds, svgImageId);
      this.updateSelection({
        selectedSvgImageIds: ids,
        selectedSvgImageId: ids[ids.length - 1]
      }, true);
    } else {
      this.updateSelection({
        selectedSvgImageIds: svgImageId ? [svgImageId] : [],
        selectedSvgImageId: svgImageId,
        selectedNodeIds: [],
        selectedBoundingBoxIds: [],
        selectedEdgeIds: [],
        selectedConnectorIds: []
      }, false);
    }
  }

  selectBoundingBox(boundingBoxId: string | undefined, multiSelect: boolean = false): void {
    const state = this.state;
    if (multiSelect && boundingBoxId) {
      const ids = this.toggleId(state.selectedBoundingBoxIds, boundingBoxId);
      this.updateSelection({
        selectedBoundingBoxIds: ids,
        selectedBoundingBoxId: ids[ids.length - 1]
      }, true);
    } else {
      this.updateSelection({
        selectedBoundingBoxIds: boundingBoxId ? [boundingBoxId] : [],
        selectedBoundingBoxId: boundingBoxId,
        selectedNodeIds: [],
        selectedSvgImageIds: [],
        selectedEdgeIds: [],
        selectedConnectorIds: []
      }, false);
    }
  }

  private toggleId(list: string[], id: string): string[] {
    const index = list.indexOf(id);
    return index > -1 ? list.filter(i => i !== id) : [...list, id];
  }
  selectTendril(nodeId: string, tendrilId: string | undefined): void {
    this.updateSelection({
      selectedNodeIds: nodeId ? [nodeId] : [],
      selectedTendrilId: tendrilId,
      selectedBoundingBoxIds: [],
      selectedSvgImageIds: [],
      selectedEdgeIds: [],
      selectedConnectorIds: []
    }, false);
  }

  selectEdge(edgeId: string | undefined, multiSelect: boolean = false): void {
    const state = this.state;
    if (multiSelect && edgeId) {
      const ids = this.toggleId(state.selectedEdgeIds, edgeId);
      this.updateSelection({
        selectedEdgeIds: ids,
        selectedEdgeId: ids[ids.length - 1]
      }, true);
    } else {
      this.updateSelection({
        selectedEdgeIds: edgeId ? [edgeId] : [],
        selectedEdgeId: edgeId,
        selectedNodeIds: [],
        selectedSvgImageIds: [],
        selectedBoundingBoxIds: [],
        selectedConnectorIds: []
      }, false);
    }
  }

  selectConnector(connectorId: string | undefined, multiSelect: boolean = false): void {
    const state = this.state;
    if (multiSelect && connectorId) {
      const ids = this.toggleId(state.selectedConnectorIds || [], connectorId);
      this.updateSelection({
        selectedConnectorIds: ids,
        selectedConnectorId: ids[ids.length - 1]
      }, true);
    } else {
      this.updateSelection({
        selectedConnectorIds: connectorId ? [connectorId] : [],
        selectedConnectorId: connectorId,
        selectedNodeIds: [],
        selectedSvgImageIds: [],
        selectedBoundingBoxIds: [],
        selectedEdgeIds: []
      }, false);
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
    const allConnectorIds = this.state.currentDiagram.connectors.map(c => c.id);

    this.state = {
      ...this.state,
      selectedNodeIds: allNodeIds,
      selectedSvgImageIds: allSvgImageIds,
      selectedBoundingBoxIds: allBoxIds,
      selectedEdgeIds: allEdgeIds,
      selectedConnectorIds: allConnectorIds,
      selectedTendrilId: undefined
    };
  }

  updateEdge(edgeId: string, updates: Partial<Edge>): void {
    const currentState = this.state;
    const newEdges = currentState.currentDiagram.edges.map(edge =>
      edge.id === edgeId ? { ...edge, ...updates } : edge
    );
    this.state = {
      ...currentState,
      currentDiagram: {
        ...currentState.currentDiagram,
        edges: newEdges
      }
    };
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

  // Undo functionality — scoped to the currently active diagram.

  /**
   * Peeks at the pending undo snapshot and returns a warning string if applying
   * the undo would permanently destroy one or more nested diagrams (i.e. nodes
   * that have an innerDiagram in the current state but are absent in the snapshot).
   * Returns null when no destructive data loss would occur.
   */
  getUndoWarning(): string | null {
    const currentDiagramId = this.state.currentDiagram.id;
    const stack = this.undoStacks.get(currentDiagramId);
    if (!stack || stack.length === 0) return null;

    const snapshot = stack[stack.length - 1]; // peek — do not pop

    // Nodes in the snapshot that still have an inner diagram
    const snapshotNodeIds = new Set(
      snapshot.elements
        .filter(isNode)
        .filter((n: Node) => !!n.innerDiagram)
        .map((n: Node) => n.id)
    );

    // Nodes in the current diagram that have an inner diagram
    const lostNodes = this.state.currentDiagram.elements
      .filter(isNode)
      .filter((n: Node) => !!n.innerDiagram)
      .filter((n: Node) => !snapshotNodeIds.has(n.id));

    if (lostNodes.length === 0) return null;

    if (lostNodes.length === 1) {
      const label = (lostNodes[0] as Node).label?.trim() || 'unnamed node';
      return `This undo will permanently delete the nested diagram inside "${label}". This cannot be undone. Continue?`;
    }

    return `This undo will permanently delete nested diagrams inside ${lostNodes.length} nodes. This cannot be undone. Continue?`;
  }

  undo(): boolean {
    const currentDiagramId = this.state.currentDiagram.id;
    const stack = this.undoStacks.get(currentDiagramId);
    if (!stack || stack.length === 0) return false;

    const previousDiagram = stack.pop()!;

    // Sync allDiagrams so prepareDiagramForSave sees the restored content.
    this.allDiagrams.set(currentDiagramId, previousDiagram);

    // If we are inside a nested diagram, update the parent's embedded snapshot
    // so that goBack() and saveStateToStorage propagate correctly.
    let updatedStack = this.state.diagramStack;
    if (updatedStack.length > 0) {
      updatedStack = updatedStack.map(parentDiag => {
        const updatedElements = parentDiag.elements.map(el => {
          if (isNode(el) && el.innerDiagram?.id === currentDiagramId) {
            return { ...el, innerDiagram: previousDiagram } as Node;
          }
          return el;
        });
        const updated = { ...parentDiag, elements: updatedElements };
        this.allDiagrams.set(updated.id, updated);
        return updated;
      });
    }

    const restoredState: DiagramState = {
      ...this.state,
      currentDiagram: previousDiagram,
      diagramStack: updatedStack,
      // Clear selection after undo — avoids dangling references to deleted elements.
      selectedNodeIds: [],
      selectedTendrilId: undefined,
      selectedBoundingBoxIds: [],
      selectedSvgImageIds: [],
      selectedEdgeIds: []
    };

    this.stateSubject.next(restoredState);
    this.saveStateToStorage(restoredState);
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
        if (this.isTendrilExposedInDiagram(tendril, innerDiagram.id)) {
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
        selectedEdgeIds: state.selectedEdgeIds,
        selectedConnectorIds: state.selectedConnectorIds
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
        selectedEdgeIds: serialized.selectedEdgeIds || [],
        selectedConnectorIds: serialized.selectedConnectorIds || [],
        viewportCenter: serialized.viewportCenter || { x: 500, y: 300 }
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
      selectedConnectorIds: [],
      selectedTendrilId: undefined,
      viewportCenter: this.state.viewportCenter
    };
  }

  private prepareDiagramForSave(diagram: Diagram): Diagram {
    return {
      ...diagram,
      elements: diagram.elements.map(element => {
        if (isNode(element) && element.innerDiagram) {
          // Always read the live diagram from allDiagrams by ID to avoid
          // serializing the stale embedded snapshot on the node.
          const liveDiagram = this.allDiagrams.get(element.innerDiagram.id) || element.innerDiagram;
          return {
            ...element,
            innerDiagram: this.prepareDiagramForSave(liveDiagram)
          };
        }
        return element;
      })
    };
  }

  private storeDiagramsRecursively(diag: Diagram): void {
    // Ensure connectors array exists for older diagram data
    if (!diag.connectors) {
      diag.connectors = [];
    }
    this.allDiagrams.set(diag.id, diag);
    diag.elements.forEach(element => {
      if (isNode(element) && element.innerDiagram) {
        this.storeDiagramsRecursively(element.innerDiagram);
      }
    });

    // Ensure groups array exists
    if (!diag.groups) {
      diag.groups = [];
    }
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
