import { Component, OnInit, OnDestroy, HostListener, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DragDropModule, CdkDragEnd, CdkDragMove } from '@angular/cdk/drag-drop';
import { Subscription } from 'rxjs';
import { DiagramService } from '../../services/diagram.service';
import { DiagramState, Node, Tendril, Edge, Position, Size } from '../../models/diagram.model';

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
  private resizeStartPos: Position = { x: 0, y: 0 };
  private resizeStartSize: Size = { width: 0, height: 0 };

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
    // Clear selection when clicking on empty canvas
    if (event.target === this.canvas.nativeElement) {
      this.diagramService.selectNode(undefined);
    }
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

    // Reset transform
    element.style.transform = '';
  }

  // Node double click to enter inner diagram
  onNodeDoubleClick(node: Node): void {
    // If node doesn't have an inner diagram, create one
    if (!node.innerDiagram) {
      this.diagramService.createInnerDiagram(node.id);
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
    }
  }

  // Mouse up to stop resizing
  @HostListener('document:mouseup', ['$event'])
  onMouseUp(event: MouseEvent): void {
    if (this.isResizing) {
      this.isResizing = false;
      this.resizeNodeId = undefined;
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

      if (selectedTendrilId && selectedNodeId) {
        // Delete selected tendril
        this.diagramService.deleteTendril(selectedNodeId, selectedTendrilId);
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

  // Get triangle points for internal tendrils
  getTendrilTrianglePoints(node: any, tendril: any): string {
    const centerX = node.position.x + tendril.position.x;
    const centerY = node.position.y + tendril.position.y;
    const size = 6; // Same size as circle radius

    if (tendril.type === 'incoming') {
      // Triangle pointing right (for incoming tendrils on left side)
      return `${centerX - size},${centerY - size} ${centerX - size},${centerY + size} ${centerX + size},${centerY}`;
    } else {
      // Triangle pointing left (for outgoing tendrils on right side)
      return `${centerX + size},${centerY - size} ${centerX + size},${centerY + size} ${centerX - size},${centerY}`;
    }
  }

  // Get current diagram title for header
  getCurrentDiagramTitle(): string {
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
}
