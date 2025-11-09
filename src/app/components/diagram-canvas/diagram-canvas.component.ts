import { Component, OnInit, OnDestroy, HostListener, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DragDropModule, CdkDragEnd, CdkDragMove } from '@angular/cdk/drag-drop';
import { Subscription } from 'rxjs';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { DiagramService } from '../../services/diagram.service';
import { DiagramState, Node, Tendril, Edge, Position, Size, BoundingBox, SvgImage } from '../../models/diagram.model';

@Component({
  selector: 'app-diagram-canvas',
  standalone: true,
  imports: [CommonModule, DragDropModule],
  templateUrl: './diagram-canvas.component.html',
  styleUrls: ['./diagram-canvas.component.sass']
})
export class DiagramCanvasComponent implements OnInit, OnDestroy {
  @ViewChild('canvas', { static: true }) canvas!: ElementRef<SVGElement>;

  state!: DiagramState;
  private subscription!: Subscription;

  // For edge creation
  isCreatingEdge = false;
  private edgeStartNodeId?: string;
  private edgeStartTendrilId?: string;
  private tempEdgeEnd: Position = { x: 0, y: 0 };

  // For Ctrl+click edge creation
  private isCtrlEdgeMode = false;
  private ctrlEdgeStartElementId?: string;

  // For resizing
  private isResizing = false;
  private resizeNodeId?: string;
  private resizeBoundingBoxId?: string;
  private resizeSvgImageId?: string;
  private resizeStartPos: Position = { x: 0, y: 0 };
  private resizeStartSize: Size = { width: 0, height: 0 };

  // For drag highlighting
  private isDraggingBoundingBox = false;
  private highlightedObjectIds: Set<string> = new Set();

  constructor(private diagramService: DiagramService, private sanitizer: DomSanitizer) {}

  ngOnInit(): void {
    this.subscription = this.diagramService.state$.subscribe(state => {
      this.state = state;
    });
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }

  // Canvas click - no longer creates nodes automatically
  onCanvasClick(event: MouseEvent): void {
    // Clear all selections when clicking on empty canvas
    this.diagramService.selectNode(undefined);
    this.diagramService.selectBoundingBox(undefined);
    this.diagramService.selectSvgImage(undefined);
    this.diagramService.selectEdge(undefined);
  }

  // Node drag handling
  onNodeDragEnd(event: CdkDragEnd, node: Node): void {
    const element = event.source.element.nativeElement;
    const transform = element.style.transform;

    // Parse transform to get new position
    const match = transform.match(/translate3d\(([^,]+)px, ([^,]+)px,/);
    if (match) {
      const deltaX = parseFloat(match[1]);
      const deltaY = parseFloat(match[2]);

      const newPosition: Position = {
        x: node.position.x + deltaX,
        y: node.position.y + deltaY
      };

      this.diagramService.updateNode(node.id, { position: newPosition });
    }

    // Clear highlights
    this.isDraggingBoundingBox = false;
    this.highlightedObjectIds.clear();

    // Reset transform
    element.style.transform = '';
  }

  // Node double click to enter inner diagram
  onNodeDoubleClick(node: Node): void {
    // If node doesn't have an inner diagram, create one
    if (!node.innerDiagram) {
      node.innerDiagram = this.diagramService.createInnerDiagram(node.id);
    }
    // Then navigate to it
    this.diagramService.enterNodeDiagram(node.id);
  }

  // Tendril click to start/create edge
  onTendrilClick(event: MouseEvent, node: Node, tendril: Tendril): void {
    event.stopPropagation();

    if (this.isCreatingEdge) {
      // Complete edge creation - only allow connecting to incoming tendrils
      if (tendril.type === 'incoming' &&
          this.edgeStartNodeId && this.edgeStartTendrilId &&
          this.edgeStartNodeId !== node.id) {
        this.diagramService.addEdge(
          this.edgeStartNodeId,
          this.edgeStartTendrilId,
          node.id,
          tendril.id
        );
      }
      // Always stop edge creation after attempt
      this.isCreatingEdge = false;
      this.edgeStartNodeId = undefined;
      this.edgeStartTendrilId = undefined;
    } else {
      // Start edge creation - only allow from outgoing tendrils
      if (tendril.type === 'outgoing') {
        this.isCreatingEdge = true;
        this.edgeStartNodeId = node.id;
        this.edgeStartTendrilId = tendril.id;
      }
    }
  }

  // Mouse move for temp edge rendering and resizing
  @HostListener('document:mousemove', ['$event'])
  onMouseMove(event: MouseEvent): void {
    if (this.isCreatingEdge) {
      const rect = this.canvas.nativeElement.getBoundingClientRect();
      this.tempEdgeEnd = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
      };
    } else if (this.isResizing && this.resizeNodeId) {
      const rect = this.canvas.nativeElement.getBoundingClientRect();
      const currentPos = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
      };

      const deltaX = currentPos.x - this.resizeStartPos.x;
      const deltaY = currentPos.y - this.resizeStartPos.y;

      const newWidth = Math.max(50, this.resizeStartSize.width + deltaX);
      const newHeight = Math.max(30, this.resizeStartSize.height + deltaY);

      // Update node size
      this.diagramService.updateNode(this.resizeNodeId, {
        size: { width: newWidth, height: newHeight }
      });

      // Reposition tendrils to stay on borders
      this.repositionTendrilsAfterResize(this.resizeNodeId, newWidth, newHeight);
    } else if (this.isResizing && this.resizeBoundingBoxId) {
      const rect = this.canvas.nativeElement.getBoundingClientRect();
      const currentPos = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
      };

      const deltaX = currentPos.x - this.resizeStartPos.x;
      const deltaY = currentPos.y - this.resizeStartPos.y;

      const newWidth = Math.max(50, this.resizeStartSize.width + deltaX);
      const newHeight = Math.max(30, this.resizeStartSize.height + deltaY);

      // Update bounding box size
      this.diagramService.updateBoundingBox(this.resizeBoundingBoxId, {
        size: { width: newWidth, height: newHeight }
      });
    } else if (this.isResizing && this.resizeSvgImageId) {
      const rect = this.canvas.nativeElement.getBoundingClientRect();
      const currentPos = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
      };

      const deltaX = currentPos.x - this.resizeStartPos.x;
      const deltaY = currentPos.y - this.resizeStartPos.y;

      // Calculate new size maintaining aspect ratio
      const aspectRatio = this.resizeStartSize.width / this.resizeStartSize.height;
      const newWidth = Math.max(10, this.resizeStartSize.width + deltaX); // Allow smaller minimum size
      const newHeight = Math.max(10, this.resizeStartSize.height + deltaY);

      // Use the dimension that changed more to maintain aspect ratio
      let finalWidth: number;
      let finalHeight: number;

      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        // Width changed more, adjust height to maintain aspect ratio
        finalWidth = newWidth;
        finalHeight = finalWidth / aspectRatio;
      } else {
        // Height changed more, adjust width to maintain aspect ratio
        finalHeight = newHeight;
        finalWidth = finalHeight * aspectRatio;
      }

      // Update SVG image size
      this.diagramService.updateSvgImage(this.resizeSvgImageId, {
        size: { width: finalWidth, height: finalHeight }
      });

      // Reposition tendrils to stay on borders
      this.repositionSvgTendrilsAfterResize(this.resizeSvgImageId, finalWidth, finalHeight);
    }
  }

  // Mouse up to stop resizing
  @HostListener('document:mouseup', ['$event'])
  onMouseUp(event: MouseEvent): void {
    if (this.isResizing) {
      this.isResizing = false;
      this.resizeNodeId = undefined;
      this.resizeBoundingBoxId = undefined;
      this.resizeSvgImageId = undefined;
    }
  }

  // Right click to cancel edge creation
  @HostListener('document:contextmenu', ['$event'])
  onRightClick(event: MouseEvent): void {
    if (this.isCreatingEdge) {
      event.preventDefault();
      this.isCreatingEdge = false;
      this.edgeStartNodeId = undefined;
      this.edgeStartTendrilId = undefined;
    }
  }

  // Keyboard shortcuts for deletion and Ctrl key tracking
  @HostListener('document:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Delete') {
      const selectedNodeId = this.state.selectedNodeId;
      const selectedTendrilId = this.state.selectedTendrilId;
      const selectedBoundingBoxId = this.state.selectedBoundingBoxId;
      const selectedEdgeId = this.state.selectedEdgeId;

      if (selectedEdgeId) {
        // Delete selected edge
        this.diagramService.deleteEdge(selectedEdgeId);
      } else if (selectedTendrilId && selectedNodeId) {
        // Delete selected tendril
        this.diagramService.deleteTendril(selectedNodeId, selectedTendrilId);
      } else if (selectedBoundingBoxId) {
        // Delete selected bounding box
        this.diagramService.deleteBoundingBox(selectedBoundingBoxId);
      } else if (selectedNodeId) {
        // Delete selected node
        this.diagramService.deleteNode(selectedNodeId);
      }
    }

    // Track Ctrl key for edge creation mode
    if (event.key === 'Control') {
      this.isCtrlEdgeMode = true;
    }
  }

  @HostListener('document:keyup', ['$event'])
  onKeyUp(event: KeyboardEvent): void {
    if (event.key === 'Control') {
      this.isCtrlEdgeMode = false;
      // Cancel any pending Ctrl edge creation
      if (this.ctrlEdgeStartElementId) {
        this.ctrlEdgeStartElementId = undefined;
      }
    }
  }

  // Start resizing a node
  startResize(event: MouseEvent, node: Node, direction: string): void {
    event.preventDefault();
    event.stopPropagation();

    const rect = this.canvas.nativeElement.getBoundingClientRect();
    this.resizeStartPos = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
    this.resizeStartSize = { ...node.size };
    this.resizeNodeId = node.id;
    this.isResizing = true;
  }

  // Node click to select or start Ctrl edge creation
  onNodeClick(event: MouseEvent, node: Node): void {
    event.stopPropagation();

    if (this.isCtrlEdgeMode) {
      this.handleCtrlClick(node.id);
    } else {
      this.diagramService.selectNode(node.id);
    }
  }

  // Context menu for nodes
  onNodeContextMenu(event: MouseEvent, node: Node): void {
    event.preventDefault();
    this.diagramService.selectNode(node.id);
    // TODO: Show context menu
  }

  // Context menu for tendrils - now selects immediately
  onTendrilContextMenu(event: MouseEvent, node: Node, tendril: Tendril): void {
    event.preventDefault();
    event.stopPropagation();
    this.diagramService.selectTendril(node.id, tendril.id);
  }

  // Bounding box click to select
  onBoundingBoxClick(event: MouseEvent, box: any): void {
    event.stopPropagation();
    this.diagramService.selectBoundingBox(box.id);
  }

  // Context menu for bounding boxes
  onBoundingBoxContextMenu(event: MouseEvent, box: any): void {
    event.preventDefault();
    event.stopPropagation();
    this.diagramService.selectBoundingBox(box.id);
    // TODO: Show context menu
  }

  // Bounding box drag started - highlight contained objects
  onBoundingBoxDragStarted(box: any): void {
    this.isDraggingBoundingBox = true;
    this.highlightedObjectIds.clear();

    // Highlight all nodes within the bounding box
    this.state.currentDiagram.nodes.forEach(node => {
      if (this.isNodeInsideBoundingBox(node, box)) {
        this.highlightedObjectIds.add(`node-${node.id}`);
      }
    });

    // Highlight all bounding boxes within this bounding box
    this.state.currentDiagram.boundingBoxes.forEach(otherBox => {
      if (otherBox.id !== box.id && this.isBoundingBoxInsideBoundingBox(otherBox, box)) {
        this.highlightedObjectIds.add(`box-${otherBox.id}`);
      }
    });
  }

  // Bounding box drag moved - update highlights if needed
  onBoundingBoxDragMoved(event: any, box: any): void {
    // Could update highlights based on current drag position if needed
    // For now, we keep the initial highlight
  }

  // Bounding box drag handling
  onBoundingBoxDragEnd(event: CdkDragEnd, box: any): void {
    const element = event.source.element.nativeElement;
    const transform = element.style.transform;

    // Parse transform to get new position
    const match = transform.match(/translate3d\(([^,]+)px, ([^,]+)px,/);
    if (match) {
      const deltaX = parseFloat(match[1]);
      const deltaY = parseFloat(match[2]);

      // Move the bounding box itself
      const newBoxPosition: Position = {
        x: box.position.x + deltaX,
        y: box.position.y + deltaY
      };
      this.diagramService.updateBoundingBox(box.id, { position: newBoxPosition });

      // Move all nodes within the bounding box
      this.state.currentDiagram.nodes.forEach(node => {
        if (this.isNodeInsideBoundingBox(node, box)) {
          const newNodePosition: Position = {
            x: node.position.x + deltaX,
            y: node.position.y + deltaY
          };
          this.diagramService.updateNode(node.id, { position: newNodePosition });
        }
      });

      // Move all other bounding boxes within this bounding box (nested grouping)
      this.state.currentDiagram.boundingBoxes.forEach(otherBox => {
        if (otherBox.id !== box.id && this.isBoundingBoxInsideBoundingBox(otherBox, box)) {
          const newOtherBoxPosition: Position = {
            x: otherBox.position.x + deltaX,
            y: otherBox.position.y + deltaY
          };
          this.diagramService.updateBoundingBox(otherBox.id, { position: newOtherBoxPosition });
        }
      });
    }

    // Reset transform
    element.style.transform = '';
  }

  // Start resizing a bounding box
  startBoundingBoxResize(event: MouseEvent, box: any, direction: string): void {
    event.preventDefault();
    event.stopPropagation();

    const rect = this.canvas.nativeElement.getBoundingClientRect();
    this.resizeStartPos = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
    this.resizeStartSize = { ...box.size };
    this.resizeBoundingBoxId = box.id;
    this.isResizing = true;
  }

  // Start resizing an SVG image
  startSvgImageResize(event: MouseEvent, svgImage: SvgImage, direction: string): void {
    event.preventDefault();
    event.stopPropagation();

    const rect = this.canvas.nativeElement.getBoundingClientRect();
    this.resizeStartPos = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
    this.resizeStartSize = { ...svgImage.size };
    this.resizeSvgImageId = svgImage.id;
    this.isResizing = true;
  }

  // Utility methods for template
  getAbsoluteTendrilPosition(node: Node, tendril: Tendril): Position {
    return {
      x: node.position.x + tendril.position.x,
      y: node.position.y + tendril.position.y
    };
  }

  getEdgePath(edge: Edge): string {
    // Get the elements (could be nodes or SVG images)
    const fromElement = this.getElementAny(edge.fromNodeId);
    const toElement = this.getElementAny(edge.toNodeId);

    if (!fromElement || !toElement) return '';

    const fromTendril = this.getTendrilFromElement(fromElement, edge.fromTendrilId);
    const toTendril = this.getTendrilFromElement(toElement, edge.toTendrilId);

    if (!fromTendril || !toTendril) return '';

    const start = this.getAbsoluteTendrilPositionAny(fromElement, fromTendril);
    const end = this.getAbsoluteTendrilPositionAny(toElement, toTendril);

    // Create a curved path
    const midX = (start.x + end.x) / 2;
    const midY = (start.y + end.y) / 2;

    return `M ${start.x} ${start.y} Q ${midX} ${midY} ${end.x} ${end.y}`;
  }

  getTempEdgePath(): string {
    if (!this.isCreatingEdge || !this.edgeStartNodeId || !this.edgeStartTendrilId) {
      return '';
    }

    // Get the starting element (could be node or SVG image)
    const startElement = this.getElementAny(this.edgeStartNodeId);
    if (!startElement) return '';

    const startTendril = this.getTendrilFromElement(startElement, this.edgeStartTendrilId);
    if (!startTendril) return '';

    const start = this.getAbsoluteTendrilPositionAny(startElement, startTendril);
    const end = this.tempEdgeEnd;

    const midX = (start.x + end.x) / 2;
    const midY = (start.y + end.y) / 2;

    return `M ${start.x} ${start.y} Q ${midX} ${midY} ${end.x} ${end.y}`;
  }

  // Get circle radius for circular nodes
  getCircleRadius(node: any): number {
    return Math.min(node.size.width, node.size.height) / 2;
  }

  // Get spring path for tendrils
  getTendrilSpringPath(node: any, tendril: any): string {
    const startX = node.position.x + tendril.position.x;
    const startY = node.position.y + tendril.position.y;
    const springLength = 20; // Length of the spring
    const amplitude = 3; // Height of the waves
    const segments = 4; // Number of wave segments

    let path = `M ${startX} ${startY}`;

    if (tendril.type === 'incoming') {
      // Spring extending to the left
      for (let i = 1; i <= segments; i++) {
        const x = startX - (springLength * i / segments);
        const y = startY + (i % 2 === 0 ? amplitude : -amplitude);
        path += ` Q ${startX - (springLength * (i - 0.5) / segments)} ${startY} ${x} ${y}`;
      }
    } else {
      // Spring extending to the right
      for (let i = 1; i <= segments; i++) {
        const x = startX + (springLength * i / segments);
        const y = startY + (i % 2 === 0 ? amplitude : -amplitude);
        path += ` Q ${startX + (springLength * (i - 0.5) / segments)} ${startY} ${x} ${y}`;
      }
    }

    return path;
  }

  // Get Y position for node text based on shape
  getNodeTextY(node: any): number {
    if (node.shape === 'circle' || node.shape === 'cylinder') {
      // Position text below the shape
      return node.position.y + node.size.height + 20;
    } else if (node.shape === 'triangle') {
      // Position text in the lower part of the triangle
      return node.position.y + node.size.height * 0.75;
    } else if (node.shape === 'stickman') {
      // Position text below the stickman figure
      return node.position.y + node.size.height + 15;
    } else if (node.shape === 'callout') {
      // Position text inside the callout bubble
      return node.position.y + node.size.height * 0.4;
    } else if (node.shape === 'text') {
      // Position text at the top of the text area for text-only nodes
      return node.position.y + 20;
    } else {
      // Center text within the shape (rectangle, pill, diamond, parallelogram, document, roundedRectangle, hexagon, trapezoid)
      return node.position.y + node.size.height / 2;
    }
  }

  // Get baseline alignment for node text based on shape
  getNodeTextBaseline(node: any): string {
    if (node.shape === 'circle' || node.shape === 'cylinder') {
      // Align to top of text for below-shape positioning
      return 'hanging';
    } else {
      // Center alignment for within-shape positioning
      return 'middle';
    }
  }

  // Get current diagram title for header
  getCurrentDiagramTitle(): string {
    if (!this.state.currentDiagram) {
      return '';
    }

    // Always show the current diagram's name
    return this.state.currentDiagram.name || 'Untitled';
  }

  // Check if an object is highlighted during drag
  isHighlighted(objectType: string, objectId: string): boolean {
    return this.highlightedObjectIds.has(`${objectType}-${objectId}`);
  }

  // Check if a node is inside a bounding box
  private isNodeInsideBoundingBox(node: any, boundingBox: any): boolean {
    const nodeLeft = node.position.x;
    const nodeRight = node.position.x + node.size.width;
    const nodeTop = node.position.y;
    const nodeBottom = node.position.y + node.size.height;

    const boxLeft = boundingBox.position.x;
    const boxRight = boundingBox.position.x + boundingBox.size.width;
    const boxTop = boundingBox.position.y;
    const boxBottom = boundingBox.position.y + boundingBox.size.height;

    return nodeLeft >= boxLeft && nodeRight <= boxRight &&
           nodeTop >= boxTop && nodeBottom <= boxBottom;
  }

  // Check if a bounding box is inside another bounding box
  private isBoundingBoxInsideBoundingBox(innerBox: any, outerBox: any): boolean {
    const innerLeft = innerBox.position.x;
    const innerRight = innerBox.position.x + innerBox.size.width;
    const innerTop = innerBox.position.y;
    const innerBottom = innerBox.position.y + innerBox.size.height;

    const outerLeft = outerBox.position.x;
    const outerRight = outerBox.position.x + outerBox.size.width;
    const outerTop = outerBox.position.y;
    const outerBottom = outerBox.position.y + outerBox.size.height;

    return innerLeft >= outerLeft && innerRight <= outerRight &&
           innerTop >= outerTop && innerBottom <= outerBottom;
  }

  // Edge click to select
  onEdgeClick(event: MouseEvent, edge: Edge): void {
    event.stopPropagation();
    this.diagramService.selectEdge(edge.id);
  }

  // Get center point of an edge for label positioning
  getEdgeCenter(edge: Edge): Position {
    // Get the elements (could be nodes or SVG images)
    const fromElement = this.getElementAny(edge.fromNodeId);
    const toElement = this.getElementAny(edge.toNodeId);

    if (!fromElement || !toElement) return { x: 0, y: 0 };

    const fromTendril = this.getTendrilFromElement(fromElement, edge.fromTendrilId);
    const toTendril = this.getTendrilFromElement(toElement, edge.toTendrilId);

    if (!fromTendril || !toTendril) return { x: 0, y: 0 };

    const start = this.getAbsoluteTendrilPositionAny(fromElement, fromTendril);
    const end = this.getAbsoluteTendrilPositionAny(toElement, toTendril);

    // Return midpoint of the edge
    return {
      x: (start.x + end.x) / 2,
      y: (start.y + end.y) / 2
    };
  }

  // Get position for edge label (offset from center for better visibility)
  getEdgeLabelPosition(edge: Edge): Position {
    const center = this.getEdgeCenter(edge);
    // Offset the label 15 pixels above the edge center
    return {
      x: center.x,
      y: center.y - 15
    };
  }

  // Check if a tendril has a connected edge with a name
  hasEdgeName(elementId: string, tendrilId: string): boolean {
    return this.state.currentDiagram.edges.some(edge => {
      // Check direct matches
      const fromMatch = (edge.fromNodeId === elementId && edge.fromTendrilId === tendrilId);
      const toMatch = (edge.toNodeId === elementId && edge.toTendrilId === tendrilId);

      // Check SVG matches (with "svg-" prefix)
      const fromSvgMatch = (edge.fromNodeId === `svg-${elementId}` && edge.fromTendrilId === tendrilId);
      const toSvgMatch = (edge.toNodeId === `svg-${elementId}` && edge.toTendrilId === tendrilId);

      return (fromMatch || toMatch || fromSvgMatch || toSvgMatch) &&
             edge.name && edge.name.trim() !== '';
    });
  }

  // Check if a propagated tendril has a connected edge
  hasPropagatedEdgeName(nodeId: string, tendrilId: string): boolean {
    // For propagated tendrils, we need to check if the original tendril in the inner diagram has an edge
    const node = this.state.currentDiagram.nodes.find(n => n.id === nodeId);
    if (!node?.innerDiagram) return false;

    // Parse the tendril ID to find the original element and tendril
    // Format: "nodeId-tendrilId" or "svg-svgImageId-tendrilId"
    const parts = tendrilId.split('-');
    if (parts.length < 2) return false;

    let originalElementId: string;
    let originalTendrilId: string;

    if (parts[0] === 'svg') {
      // Format: "svg-svgImageId-tendrilId"
      originalElementId = `svg-${parts[1]}`;
      originalTendrilId = parts.slice(2).join('-');
    } else {
      // Format: "nodeId-tendrilId"
      originalElementId = parts[0];
      originalTendrilId = parts.slice(1).join('-');
    }

    // Check if the original tendril has an edge in the inner diagram
    // We need to check the current diagram's edges since propagated tendrils create edges at the parent level
    return this.state.currentDiagram.edges.some((edge: Edge) => {
      const fromMatch = (edge.fromNodeId === nodeId && edge.fromTendrilId === tendrilId);
      const toMatch = (edge.toNodeId === nodeId && edge.toTendrilId === tendrilId);

      return (fromMatch || toMatch) && edge.name && edge.name.trim() !== '';
    });
  }



  // Reposition tendrils to stay on borders after node resize
  private repositionTendrilsAfterResize(nodeId: string, newWidth: number, newHeight: number): void {
    const node = this.state.currentDiagram.nodes.find(n => n.id === nodeId);
    if (!node) return;

    // Separate incoming and outgoing tendrils
    const incomingTendrils = node.tendrils.filter(t => t.type === 'incoming');
    const outgoingTendrils = node.tendrils.filter(t => t.type === 'outgoing');

    // Reposition incoming tendrils along left edge
    incomingTendrils.forEach((tendril, index) => {
      const spacing = newHeight / (incomingTendrils.length + 1);
      const y = spacing * (index + 1); // Distribute evenly

      this.diagramService.updateTendril(nodeId, tendril.id, {
        position: {
          x: 0, // Left border
          y: Math.max(10, Math.min(newHeight - 10, y)) // Keep within bounds
        }
      });
    });

    // Reposition outgoing tendrils along right edge
    outgoingTendrils.forEach((tendril, index) => {
      const spacing = newHeight / (outgoingTendrils.length + 1);
      const y = spacing * (index + 1); // Distribute evenly

      this.diagramService.updateTendril(nodeId, tendril.id, {
        position: {
          x: newWidth, // Right border
          y: Math.max(10, Math.min(newHeight - 10, y)) // Keep within bounds
        }
      });
    });
  }

  // Reposition tendrils to stay on borders after SVG image resize
  private repositionSvgTendrilsAfterResize(svgImageId: string, newWidth: number, newHeight: number): void {
    const svgImage = this.state.currentDiagram.svgImages.find(s => s.id === svgImageId);
    if (!svgImage) return;

    // Separate incoming and outgoing tendrils
    const incomingTendrils = svgImage.tendrils.filter(t => t.type === 'incoming');
    const outgoingTendrils = svgImage.tendrils.filter(t => t.type === 'outgoing');

    // Reposition incoming tendrils along left edge
    incomingTendrils.forEach((tendril, index) => {
      const spacing = newHeight / (incomingTendrils.length + 1);
      const y = spacing * (index + 1); // Distribute evenly

      this.diagramService.updateSvgTendril(svgImageId, tendril.id, {
        position: {
          x: 0, // Left border
          y: Math.max(10, Math.min(newHeight - 10, y)) // Keep within bounds
        }
      });
    });

    // Reposition outgoing tendrils along right edge
    outgoingTendrils.forEach((tendril, index) => {
      const spacing = newHeight / (outgoingTendrils.length + 1);
      const y = spacing * (index + 1); // Distribute evenly

      this.diagramService.updateSvgTendril(svgImageId, tendril.id, {
        position: {
          x: newWidth, // Right border
          y: Math.max(10, Math.min(newHeight - 10, y)) // Keep within bounds
        }
      });
    });
  }

  getBoundingBoxes() : BoundingBox[] {
    if (this.state.currentDiagram && this.state.currentDiagram.boundingBoxes) {
      return this.state.currentDiagram.boundingBoxes
    }

    return [];
  }

  getCurrentEdges() : Edge[] {
    if (this.state.currentDiagram && this.state.currentDiagram.edges) {
      return this.state.currentDiagram.edges;
    }

    return [];
  }

  getCurrentNodes() : Node[] {
    if (this.state.currentDiagram && this.state.currentDiagram.nodes) {
      return this.state.currentDiagram.nodes;
    }

    return [];
  }

  // SVG Image methods
  getSvgImages(): SvgImage[] {
    if (this.state.currentDiagram && this.state.currentDiagram.svgImages) {
      return this.state.currentDiagram.svgImages;
    }
    return [];
  }

  // Sanitize SVG content for safe HTML binding
  sanitizeSvgContent(svgContent: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(svgContent);
  }

  // SVG image drag handling
  onSvgImageDragEnd(event: CdkDragEnd, svgImage: SvgImage): void {
    const element = event.source.element.nativeElement;
    const transform = element.style.transform;

    // Parse transform to get new position
    const match = transform.match(/translate3d\(([^,]+)px, ([^,]+)px,/);
    if (match) {
      const deltaX = parseFloat(match[1]);
      const deltaY = parseFloat(match[2]);

      const newPosition: Position = {
        x: svgImage.position.x + deltaX,
        y: svgImage.position.y + deltaY
      };

      this.updateSvgImage(svgImage.id, { position: newPosition });
    }

    // Reset transform
    element.style.transform = '';
  }

  // SVG image click to select or start Ctrl edge creation
  onSvgImageClick(event: MouseEvent, svgImage: SvgImage): void {
    event.stopPropagation();

    if (this.isCtrlEdgeMode) {
      this.handleCtrlClick(`svg-${svgImage.id}`);
    } else {
      this.diagramService.selectSvgImage(svgImage.id);
    }
  }

  // SVG image context menu
  onSvgImageContextMenu(event: MouseEvent, svgImage: SvgImage): void {
    event.preventDefault();
    event.stopPropagation();
    this.diagramService.selectSvgImage(svgImage.id);
  }

  // SVG tendril click
  onSvgTendrilClick(event: MouseEvent, svgImage: SvgImage, tendril: Tendril): void {
    event.stopPropagation();

    if (this.isCreatingEdge) {
      // Complete edge creation - only allow connecting to incoming tendrils
      if (tendril.type === 'incoming' &&
          this.edgeStartNodeId && this.edgeStartTendrilId) {
        this.diagramService.addEdge(
          this.edgeStartNodeId,
          this.edgeStartTendrilId,
          `svg-${svgImage.id}`,
          tendril.id
        );
      }
      // Always stop edge creation after attempt
      this.isCreatingEdge = false;
      this.edgeStartNodeId = undefined;
      this.edgeStartTendrilId = undefined;
    } else {
      // Start edge creation - only allow from outgoing tendrils
      if (tendril.type === 'outgoing') {
        this.isCreatingEdge = true;
        this.edgeStartNodeId = `svg-${svgImage.id}`;
        this.edgeStartTendrilId = tendril.id;
      }
    }
  }

  // SVG tendril context menu
  onSvgTendrilContextMenu(event: MouseEvent, svgImage: SvgImage, tendril: Tendril): void {
    event.preventDefault();
    event.stopPropagation();
    this.diagramService.selectTendril(`svg-${svgImage.id}`, tendril.id);
  }

  // Get spring path for SVG tendrils
  getSvgTendrilSpringPath(svgImage: SvgImage, tendril: Tendril): string {
    const startX = svgImage.position.x + tendril.position.x;
    const startY = svgImage.position.y + tendril.position.y;
    const springLength = 20; // Length of the spring
    const amplitude = 3; // Height of the waves
    const segments = 4; // Number of wave segments

    let path = `M ${startX} ${startY}`;

    if (tendril.type === 'incoming') {
      // Spring extending to the left
      for (let i = 1; i <= segments; i++) {
        const x = startX - (springLength * i / segments);
        const y = startY + (i % 2 === 0 ? amplitude : -amplitude);
        path += ` Q ${startX - (springLength * (i - 0.5) / segments)} ${startY} ${x} ${y}`;
      }
    } else {
      // Spring extending to the right
      for (let i = 1; i <= segments; i++) {
        const x = startX + (springLength * i / segments);
        const y = startY + (i % 2 === 0 ? amplitude : -amplitude);
        path += ` Q ${startX + (springLength * (i - 0.5) / segments)} ${startY} ${x} ${y}`;
      }
    }

    return path;
  }

  // Update SVG image
  private updateSvgImage(svgImageId: string, updates: Partial<SvgImage>): void {
    this.diagramService.updateSvgImage(svgImageId, updates);
  }

  // Get any element (node or SVG image) by ID
  private getElementAny(elementId: string): Node | SvgImage | undefined {
    // Check if it's a regular node
    const node = this.state.currentDiagram.nodes.find(n => n.id === elementId);
    if (node) return node;

    // Check if it's an SVG image
    const svgImage = this.state.currentDiagram.svgImages.find(s => s.id === elementId);
    if (svgImage) return svgImage;

    // Check if it's an SVG image with "svg-" prefix
    if (elementId.startsWith('svg-')) {
      const svgImageId = elementId.substring(4);
      return this.state.currentDiagram.svgImages.find(s => s.id === svgImageId);
    }

    return undefined;
  }

  // Get tendril from any element (node or SVG image)
  private getTendrilFromElement(element: Node | SvgImage, tendrilId: string): Tendril | undefined {
    if ('tendrils' in element) {
      // First check if it's a regular tendril on the element
      const regularTendril = element.tendrils.find(t => t.id === tendrilId);
      if (regularTendril) return regularTendril;

      // Check if it's a propagated tendril (only for nodes)
      if ('innerDiagram' in element && this.isPropagatedTendril(element.id, tendrilId)) {
        const propagatedTendrils = this.getPropagatedTendrils(element as Node);
        return propagatedTendrils.find(t => t.id === tendrilId);
      }
    }
    return undefined;
  }

  // Get absolute tendril position from any element (node or SVG image)
  private getAbsoluteTendrilPositionAny(element: Node | SvgImage, tendril: Tendril): Position {
    // Check if this is a propagated tendril (has a compound ID like "nodeId-tendrilId")
    if (tendril.id.includes('-') && this.isPropagatedTendril(element.id, tendril.id)) {
      // For propagated tendrils, calculate position around the node perimeter
      const propagatedTendrils = this.getPropagatedTendrils(element as Node);
      const index = propagatedTendrils.findIndex(t => t.id === tendril.id);
      const pos = this.getPropagatedTendrilPosition(element as Node, index);
      return pos || { x: element.position.x + tendril.position.x, y: element.position.y + tendril.position.y };
    }

    return {
      x: element.position.x + tendril.position.x,
      y: element.position.y + tendril.position.y
    };
  }

  // Shape calculation methods for new flowchart symbols
  getDiamondPoints(node: any): string {
    const x = node.position.x;
    const y = node.position.y;
    const w = node.size.width;
    const h = node.size.height;

    // Diamond points: left, top, right, bottom
    const left = x;
    const top = y + h / 2;
    const right = x + w;
    const bottom = y + h / 2;

    return `${left},${y + h / 2} ${x + w / 2},${y} ${right},${y + h / 2} ${x + w / 2},${y + h}`;
  }

  getParallelogramPoints(node: any): string {
    const x = node.position.x;
    const y = node.position.y;
    const w = node.size.width;
    const h = node.size.height;
    const skew = w * 0.2; // Skew amount

    // Parallelogram points: top-left, top-right, bottom-right, bottom-left
    return `${x + skew},${y} ${x + w},${y} ${x + w - skew},${y + h} ${x},${y + h}`;
  }

  getDocumentBottomPath(node: any): string {
    const x = node.position.x;
    const y = node.position.y;
    const w = node.size.width;
    const h = node.size.height - 15;

    // Create a wavy bottom for document shape
    const waveHeight = 8;
    const waveWidth = w / 3;

    return `M ${x} ${y + h}
             L ${x} ${y + h + waveHeight}
             Q ${x + waveWidth / 2} ${y + h} ${x + waveWidth} ${y + h + waveHeight}
             Q ${x + waveWidth * 1.5} ${y + h + waveHeight * 2} ${x + waveWidth * 2} ${y + h + waveHeight}
             Q ${x + waveWidth * 2.5} ${y + h} ${x + w} ${y + h + waveHeight}
             L ${x + w} ${y + h} Z`;
  }

  getHexagonPoints(node: any): string {
    const x = node.position.x;
    const y = node.position.y;
    const w = node.size.width;
    const h = node.size.height;
    const indent = w * 0.2; // Indentation for hexagon sides

    // Hexagon points: top-left, top-right, middle-right, bottom-right, bottom-left, middle-left
    return `${x + indent},${y}
            ${x + w - indent},${y}
            ${x + w},${y + h / 2}
            ${x + w - indent},${y + h}
            ${x + indent},${y + h}
            ${x},${y + h / 2}`;
  }

  getTrianglePoints(node: any): string {
    const x = node.position.x;
    const y = node.position.y;
    const w = node.size.width;
    const h = node.size.height;

    // Triangle points: top, bottom-right, bottom-left
    return `${x + w / 2},${y} ${x + w},${y + h} ${x},${y + h}`;
  }

  getTrapezoidPoints(node: any): string {
    const x = node.position.x;
    const y = node.position.y;
    const w = node.size.width;
    const h = node.size.height;
    const indent = w * 0.15; // Indentation for trapezoid top

    // Trapezoid points: top-left, top-right, bottom-right, bottom-left
    return `${x + indent},${y} ${x + w - indent},${y} ${x + w},${y + h} ${x},${y + h}`;
  }

  getCalloutPointerPoints(node: any): string {
    const x = node.position.x;
    const y = node.position.y;
    const w = node.size.width;
    const h = node.size.height;

    // Callout pointer points: from bottom-right of bubble to point downward
    const bubbleRight = x + w * 0.8;
    const bubbleBottom = y + h * 0.8;
    const pointerX = x + w * 0.9;
    const pointerY = y + h;

    return `${bubbleRight},${bubbleBottom} ${pointerX},${bubbleBottom} ${pointerX},${pointerY}`;
  }

  getCubeTopFacePoints(node: any): string {
    const x = node.position.x;
    const y = node.position.y;
    const w = node.size.width;
    const h = node.size.height;
    const depth = Math.min(w, h) * 0.15; // Perspective depth

    // Top face: from top-right of front face to top-left with depth
    const frontTopRight = x + w * 0.9;
    const frontTopLeft = x + w * 0.1;
    const topTopRight = frontTopRight + depth;
    const topTopLeft = frontTopLeft + depth;

    return `${frontTopRight},${y + h * 0.1} ${topTopRight},${y} ${topTopLeft},${y} ${frontTopLeft},${y + h * 0.1}`;
  }

  getCubeSideFacePoints(node: any): string {
    const x = node.position.x;
    const y = node.position.y;
    const w = node.size.width;
    const h = node.size.height;
    const depth = Math.min(w, h) * 0.15; // Perspective depth

    // Side face: from bottom-right of front face to right side with depth
    const frontBottomRight = x + w * 0.9;
    const frontTopRight = x + w * 0.9;
    const sideBottomRight = frontBottomRight + depth;
    const sideTopRight = frontTopRight + depth;

    return `${frontBottomRight},${y + h * 0.9} ${frontTopRight},${y + h * 0.1} ${sideTopRight},${y} ${sideBottomRight},${y + h * 0.8}`;
  }

  getTapeRadius(node: any): number {
    return Math.min(node.size.width, node.size.height) / 2;
  }

  getTapeInnerRadius(node: any): number {
    return Math.min(node.size.width, node.size.height) / 4;
  }

  getTapeLineX2(node: any, i: number): number {
    const centerX = node.position.x + node.size.width / 2;
    const centerY = node.position.y + node.size.height / 2;
    const radius = Math.min(node.size.width, node.size.height) / 3;
    return centerX + Math.cos(i * Math.PI / 3) * radius;
  }

  getTapeLineY2(node: any, i: number): number {
    const centerX = node.position.x + node.size.width / 2;
    const centerY = node.position.y + node.size.height / 2;
    const radius = Math.min(node.size.width, node.size.height) / 3;
    return centerY + Math.sin(i * Math.PI / 3) * radius;
  }

  getShapeTypeLabel(shape: string): string {
    const shapeLabels: { [key: string]: string } = {
      'circle': 'Circle',
      'cylinder': 'Cylinder',
      'diamond': 'Diamond',
      'parallelogram': 'Para',
      'document': 'Document',
      'roundedRectangle': 'Round',
      'hexagon': 'Hexagon',
      'triangle': 'Triangle',
      'trapezoid': 'Trap',
      'stickman': 'Stickman',
      'callout': 'Callout',
      'tape': 'Tape',
      'cube': 'Cube',
      'text': 'Text'
    };
    return shapeLabels[shape] || shape;
  }

  // Get propagated tendrils from inner diagram
  getPropagatedTendrils(node: Node): Tendril[] {
    return this.diagramService.getExposedTendrilsFromInnerDiagram(node.id);
  }

  // Check if a tendril is propagated from inner diagram
  isPropagatedTendril(nodeId: string, tendrilId: string): boolean {
    const propagatedTendrils = this.getPropagatedTendrils(this.state.currentDiagram.nodes.find(n => n.id === nodeId)!);
    return propagatedTendrils.some(t => t.id === tendrilId);
  }

  // Get position for propagated tendrils around node perimeter
  getPropagatedTendrilPosition(node: Node, index: number): Position | null {
    const propagatedTendrils = this.getPropagatedTendrils(node);
    if (propagatedTendrils.length === 0) return null;

    // Position tendrils around the node perimeter
    const angleStep = (2 * Math.PI) / propagatedTendrils.length;
    const angle = index * angleStep - Math.PI / 2; // Start from top
    const radius = Math.max(node.size.width, node.size.height) / 2 + 15; // Outside the node

    const centerX = node.position.x + node.size.width / 2;
    const centerY = node.position.y + node.size.height / 2;

    return {
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius
    };
  }

  // Handle propagated tendril click
  onPropagatedTendrilClick(event: MouseEvent, node: Node, tendril: Tendril): void {
    event.stopPropagation();

    if (this.isCreatingEdge) {
      // Complete edge creation - only allow connecting to incoming tendrils
      if (tendril.type === 'incoming' &&
          this.edgeStartNodeId && this.edgeStartTendrilId &&
          this.edgeStartNodeId !== node.id) {
        this.diagramService.addEdge(
          this.edgeStartNodeId,
          this.edgeStartTendrilId,
          node.id,
          tendril.id
        );
      }
      // Always stop edge creation after attempt
      this.isCreatingEdge = false;
      this.edgeStartNodeId = undefined;
      this.edgeStartTendrilId = undefined;
    } else {
      // Start edge creation - allow from outgoing propagated tendrils
      if (tendril.type === 'outgoing') {
        this.isCreatingEdge = true;
        this.edgeStartNodeId = node.id;
        this.edgeStartTendrilId = tendril.id;
      }
    }
  }

  // Handle propagated tendril context menu
  onPropagatedTendrilContextMenu(event: MouseEvent, node: Node, tendril: Tendril): void {
    event.preventDefault();
    event.stopPropagation();
    this.diagramService.selectTendril(node.id, tendril.id);
  }

  // Handle Ctrl+click edge creation
  private handleCtrlClick(elementId: string): void {
    if (!this.ctrlEdgeStartElementId) {
      // Start edge creation - auto-create outgoing tendril
      const outgoingTendrilId = this.autoCreateOutgoingTendril(elementId);
      if (outgoingTendrilId) {
        this.ctrlEdgeStartElementId = elementId;
        this.edgeStartNodeId = elementId;
        this.edgeStartTendrilId = outgoingTendrilId;
        this.isCreatingEdge = true;
      }
    } else if (this.ctrlEdgeStartElementId !== elementId) {
      // Complete edge creation - auto-create incoming tendril
      const incomingTendrilId = this.autoCreateIncomingTendril(elementId);
      if (incomingTendrilId) {
        this.diagramService.addEdge(
          this.edgeStartNodeId!,
          this.edgeStartTendrilId!,
          elementId,
          incomingTendrilId
        );
      }
      // Reset edge creation state
      this.ctrlEdgeStartElementId = undefined;
      this.edgeStartNodeId = undefined;
      this.edgeStartTendrilId = undefined;
      this.isCreatingEdge = false;
    }
  }

  // Auto-create an outgoing tendril on an element
  private autoCreateOutgoingTendril(elementId: string): string | null {
    const element = this.getElementAny(elementId);
    if (!element || !('tendrils' in element)) return null;

    // Check if element already has an outgoing tendril
    const existingOutgoing = element.tendrils.find(t => t.type === 'outgoing');
    if (existingOutgoing) {
      return existingOutgoing.id;
    }

    // Create new outgoing tendril using service method
    const position = { x: element.size.width, y: element.size.height / 2 };

    if (elementId.startsWith('svg-')) {
      // It's an SVG image
      const svgImageId = elementId.substring(4);
      this.diagramService.addTendrilToSvgImage(svgImageId, 'outgoing', position);
    } else {
      // It's a node
      this.diagramService.addTendril(elementId, 'outgoing', position);
    }

    // Return the ID of the newly created tendril
    const updatedElement = this.getElementAny(elementId);
    const newOutgoing = updatedElement?.tendrils.find(t => t.type === 'outgoing');
    return newOutgoing?.id || null;
  }

  // Auto-create an incoming tendril on an element
  private autoCreateIncomingTendril(elementId: string): string | null {
    const element = this.getElementAny(elementId);
    if (!element || !('tendrils' in element)) return null;

    // Check if element already has an incoming tendril
    const existingIncoming = element.tendrils.find(t => t.type === 'incoming');
    if (existingIncoming) {
      return existingIncoming.id;
    }

    // Create new incoming tendril using service method
    const position = { x: 0, y: element.size.height / 2 };

    if (elementId.startsWith('svg-')) {
      // It's an SVG image
      const svgImageId = elementId.substring(4);
      this.diagramService.addTendrilToSvgImage(svgImageId, 'incoming', position);
    } else {
      // It's a node
      this.diagramService.addTendril(elementId, 'incoming', position);
    }

    // Return the ID of the newly created tendril
    const updatedElement = this.getElementAny(elementId);
    const newIncoming = updatedElement?.tendrils.find(t => t.type === 'incoming');
    return newIncoming?.id || null;
  }
}
