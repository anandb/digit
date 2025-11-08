import { Component, OnInit, OnDestroy, HostListener, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DragDropModule, CdkDragEnd, CdkDragMove } from '@angular/cdk/drag-drop';
import { Subscription } from 'rxjs';
import { DiagramService } from '../../services/diagram.service';
import { DiagramState, Node, Tendril, Edge, Position, Size, BoundingBox } from '../../models/diagram.model';

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

  // For resizing
  private isResizing = false;
  private resizeNodeId?: string;
  private resizeBoundingBoxId?: string;
  private resizeStartPos: Position = { x: 0, y: 0 };
  private resizeStartSize: Size = { width: 0, height: 0 };

  // For drag highlighting
  private isDraggingBoundingBox = false;
  private highlightedObjectIds: Set<string> = new Set();

  constructor(private diagramService: DiagramService) {}

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
    }
  }

  // Mouse up to stop resizing
  @HostListener('document:mouseup', ['$event'])
  onMouseUp(event: MouseEvent): void {
    if (this.isResizing) {
      this.isResizing = false;
      this.resizeNodeId = undefined;
      this.resizeBoundingBoxId = undefined;
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

  // Keyboard shortcuts for deletion
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

  // Context menu for nodes
  onNodeContextMenu(event: MouseEvent, node: Node): void {
    event.preventDefault();
    this.diagramService.selectNode(node.id);
    // TODO: Show context menu
  }

  // Context menu for tendrils
  onTendrilContextMenu(event: MouseEvent, node: Node, tendril: Tendril): void {
    event.preventDefault();
    event.stopPropagation();
    this.diagramService.selectTendril(node.id, tendril.id);
    // TODO: Show context menu
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

  // Utility methods for template
  getAbsoluteTendrilPosition(node: Node, tendril: Tendril): Position {
    return {
      x: node.position.x + tendril.position.x,
      y: node.position.y + tendril.position.y
    };
  }

  getEdgePath(edge: Edge): string {
    const fromNode = this.state.currentDiagram.nodes.find(n => n.id === edge.fromNodeId);
    const toNode = this.state.currentDiagram.nodes.find(n => n.id === edge.toNodeId);

    if (!fromNode || !toNode) return '';

    const fromTendril = fromNode.tendrils.find(t => t.id === edge.fromTendrilId);
    const toTendril = toNode.tendrils.find(t => t.id === edge.toTendrilId);

    if (!fromTendril || !toTendril) return '';

    const start = this.getAbsoluteTendrilPosition(fromNode, fromTendril);
    const end = this.getAbsoluteTendrilPosition(toNode, toTendril);

    // Create a curved path
    const midX = (start.x + end.x) / 2;
    const midY = (start.y + end.y) / 2;

    return `M ${start.x} ${start.y} Q ${midX} ${midY} ${end.x} ${end.y}`;
  }

  getTempEdgePath(): string {
    if (!this.isCreatingEdge || !this.edgeStartNodeId || !this.edgeStartTendrilId) {
      return '';
    }

    const startNode = this.state.currentDiagram.nodes.find(n => n.id === this.edgeStartNodeId);
    if (!startNode) return '';

    const startTendril = startNode.tendrils.find(t => t.id === this.edgeStartTendrilId);
    if (!startTendril) return '';

    const start = this.getAbsoluteTendrilPosition(startNode, startTendril);
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
    } else {
      // Center text within the shape (rectangle, pill)
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

    if (this.state.diagramStack.length > 0) {
      // We're in a nested diagram - show the parent node name
      const parentDiagram = this.state.diagramStack[this.state.diagramStack.length - 1];

      // Find the node that contains this inner diagram
      for (const node of parentDiagram.nodes) {
        if (node.innerDiagram?.id === this.state.currentDiagram.id) {
          return node.name || 'Untitled Node';
        }
      }
    }
    // We're in the root diagram
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
    const fromNode = this.state.currentDiagram.nodes.find(n => n.id === edge.fromNodeId);
    const toNode = this.state.currentDiagram.nodes.find(n => n.id === edge.toNodeId);

    if (!fromNode || !toNode) return { x: 0, y: 0 };

    const fromTendril = fromNode.tendrils.find(t => t.id === edge.fromTendrilId);
    const toTendril = toNode.tendrils.find(t => t.id === edge.toTendrilId);

    if (!fromTendril || !toTendril) return { x: 0, y: 0 };

    const start = this.getAbsoluteTendrilPosition(fromNode, fromTendril);
    const end = this.getAbsoluteTendrilPosition(toNode, toTendril);

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
  hasEdgeName(nodeId: string, tendrilId: string): boolean {
    return this.state.currentDiagram.edges.some(edge =>
      ((edge.fromNodeId === nodeId && edge.fromTendrilId === tendrilId) ||
       (edge.toNodeId === nodeId && edge.toTendrilId === tendrilId)) &&
      edge.name && edge.name.trim() !== ''
    );
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
}
