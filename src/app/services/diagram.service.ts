import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Diagram, DiagramState, Node, Position, DiagramElement, isNode, isSvgImage, isBoundingBox, Group, BoundingBox, SvgImage } from '../models/diagram.model';

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
      selectedBoundingBoxIds: [],
      selectedSvgImageIds: [],
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
    // where selection happens to stay the same (e.g. direct connector edits).
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
    // prepareDiagramForSave always sees the latest state.
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
    } else if (shape === 'crcCard') {
      size = { width: 600, height: 800 };
    } else if (shape === 'threatTable') {
      size = { width: 300, height: 200 };
    }

    const newNode: Node = {
      id: this.generateId(),
      label: (shape === 'verticalLine' || shape === 'horizontalLine') ? '' :
             (shape === 'numberedCircle' ? '1' : 'New Node'),
      position,
      size,
      attributes: shape === 'threatTable' ? {
        threatTableData: {
          title: 'Threat Actors',
          col1Header: 'ID',
          col2Header: 'Description',
          collapsed: false,
          rows: [
            { col1: 'T01', col2: 'Malicious user' },
            { col1: 'T02', col2: 'Man-in-the-middle' },
            { col1: 'T03', col2: 'Compromised payment partner' }
          ]
        }
      } : {},
      notes: '',
      shape: shape,
      borderColor: options?.borderColor || '#000000',
      fillColor: options?.fillColor || (shape === 'note' ? '#fff9c4' : (shape === 'lightning' ? '#fdd835' : (shape === 'threatTable' ? '#ffe0e0' : '#ffffff'))),
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

    this.state = {
      ...currentState,
      currentDiagram: {
        ...currentState.currentDiagram,
        elements: newElements
      }
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
      this.state = {
        ...currentState,
        currentDiagram: {
          ...currentState.currentDiagram,
          elements: newElements,
          boundingBoxes: newBoundingBoxes
        }
      };
    }
  }

  updateElementProperty(elementId: string, property: string, value: any): void {
    this.updateElement(elementId, { [property]: value });
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
        ),
        // Remove the deleted box from any group it belonged to
        groups: (currentState.currentDiagram.groups || [])
          .map(g => ({ ...g, elementIds: g.elementIds.filter(id => id !== boundingBoxId) }))
          .filter(g => g.elementIds.length > 0)
      }
    };
  }

  // Delete multiple bounding boxes at once (one undo entry) — mirrors deleteElements
  deleteBoundingBoxes(ids: string[]): void {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    const currentState = this.state;
    this.state = {
      ...currentState,
      currentDiagram: {
        ...currentState.currentDiagram,
        boundingBoxes: currentState.currentDiagram.boundingBoxes.filter(box => !idSet.has(box.id)),
        connectors: (currentState.currentDiagram.connectors || []).filter(connector =>
          !idSet.has(connector.fromNodeId) && !idSet.has(connector.toNodeId)
        ),
        groups: (currentState.currentDiagram.groups || [])
          .map(g => ({ ...g, elementIds: g.elementIds.filter(id => !idSet.has(id)) }))
          .filter(g => g.elementIds.length > 0)
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

  // Expand a set of element/bounding-box ids to include all siblings that share
  // a group with any of the input ids. Pure read — no state mutation. Used by
  // the canvas Delete handler so that deleting one grouped shape cascades to
  // the entire group (Behaviour B).
  expandIdsWithGroupSiblings(ids: string[]): string[] {
    if (ids.length === 0) return [];
    const diag = this.state.currentDiagram;
    const groups = diag.groups || [];
    if (groups.length === 0) return Array.from(new Set(ids));

    const result = new Set(ids);
    ids.forEach(id => {
      const el = diag.elements.find(e => e.id === id);
      const box = el ? null : diag.boundingBoxes.find(b => b.id === id);
      const groupId = el?.groupId ?? box?.groupId;
      if (groupId) {
        const group = groups.find(g => g.id === groupId);
        group?.elementIds.forEach(sid => result.add(sid));
      }
    });
    return Array.from(result);
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
      selectedConnectorIds: []
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
      selectedBoundingBoxIds: [],
      selectedSvgImageIds: [],
      selectedConnectorIds: [],
      viewportCenter: { x: 500, y: 300 },
      viewSvgContent: undefined,
      viewSvgFileName: undefined
    };
  }

  // View SVG content operations
  setViewSvgContent(content: string | undefined, fileName?: string): void {
    let processedContent = content;
    if (content && typeof DOMParser !== 'undefined') {
      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(content, 'image/svg+xml');
        const svgElement = doc.querySelector('svg');
        if (svgElement) {
          // Get viewBox values
          const viewBox = svgElement.getAttribute('viewBox');
          let width = svgElement.getAttribute('width');
          let height = svgElement.getAttribute('height');

          let viewBoxWidth = 800;
          let viewBoxHeight = 600;

          if (viewBox) {
            const parts = viewBox.trim().split(/\s+/);
            if (parts.length === 4) {
              viewBoxWidth = parseFloat(parts[2]) || 800;
              viewBoxHeight = parseFloat(parts[3]) || 600;
            }
          }

          // If width/height are percentages or not set, override them with viewBox values
          if (!width || width.includes('%')) {
            width = viewBoxWidth.toString();
          }
          if (!height || height.includes('%')) {
            height = viewBoxHeight.toString();
          }

          svgElement.setAttribute('width', width);
          svgElement.setAttribute('height', height);

          // Ensure it has a viewBox
          if (!viewBox) {
            svgElement.setAttribute('viewBox', `0 0 ${width} ${height}`);
          }

          // Ensure it's positioned at 0, 0
          svgElement.setAttribute('x', '0');
          svgElement.setAttribute('y', '0');

          processedContent = new XMLSerializer().serializeToString(svgElement);
        }
      } catch (e) {
        console.error('Error processing viewed SVG:', e);
      }
    }

    this.state = {
      ...this.state,
      viewSvgContent: processedContent,
      viewSvgFileName: fileName,
      selectedNodeIds: [],
      selectedBoundingBoxIds: [],
      selectedSvgImageIds: [],
      selectedConnectorIds: []
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
      dotted: false,
      startArrow: 'none',
      endArrow: 'solid',
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

  getSvgImage(svgImageId: string): import('../models/diagram.model').SvgImage | undefined {
    const element = this.getElement(svgImageId);
    return element && isSvgImage(element) ? element : undefined;
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
        diagramStack: [],
        viewSvgContent: undefined,
        viewSvgFileName: undefined
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
    this.state = { ...this.state, ...updates };
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
        selectedConnectorIds: []
      }, false);
    }
  }

  private toggleId(list: string[], id: string): string[] {
    const index = list.indexOf(id);
    return index > -1 ? list.filter(i => i !== id) : [...list, id];
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
        selectedBoundingBoxIds: []
      }, false);
    }
  }

  // Clear all selections
  clearSelection(): void {
    this.state = {
      ...this.state,
      selectedNodeIds: [],
      selectedBoundingBoxIds: [],
      selectedSvgImageIds: [],
      selectedConnectorIds: []
    };
  }

  selectAll(): void {
    const allNodeIds = this.state.currentDiagram.elements.filter(isNode).map(e => e.id);
    const allSvgImageIds = this.state.currentDiagram.elements.filter(isSvgImage).map(e => e.id);
    const allBoxIds = this.state.currentDiagram.boundingBoxes.map(b => b.id);
    const allConnectorIds = this.state.currentDiagram.connectors.map(c => c.id);

    this.state = {
      ...this.state,
      selectedNodeIds: allNodeIds,
      selectedSvgImageIds: allSvgImageIds,
      selectedBoundingBoxIds: allBoxIds,
      selectedConnectorIds: allConnectorIds
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
      selectedBoundingBoxIds: [],
      selectedSvgImageIds: [],
      selectedConnectorIds: []
    };

    this.stateSubject.next(restoredState);
    this.saveStateToStorage(restoredState);
    return true;
  }

  // Public getters
  get currentState(): DiagramState {
    const state = this.state;
    return {
      ...state,
      // Computed properties for backward compatibility
      selectedNodeId: state.selectedNodeIds.length > 0 ? state.selectedNodeIds[state.selectedNodeIds.length - 1] : undefined,
      selectedBoundingBoxId: state.selectedBoundingBoxIds.length > 0 ? state.selectedBoundingBoxIds[state.selectedBoundingBoxIds.length - 1] : undefined,
      selectedSvgImageId: state.selectedSvgImageIds.length > 0 ? state.selectedSvgImageIds[state.selectedSvgImageIds.length - 1] : undefined
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
        selectedBoundingBoxIds: state.selectedBoundingBoxIds,
        selectedSvgImageIds: state.selectedSvgImageIds,
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
        selectedBoundingBoxIds: serialized.selectedBoundingBoxIds || [],
        selectedSvgImageIds: serialized.selectedSvgImageIds || [],
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
      selectedConnectorIds: [],
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

}
