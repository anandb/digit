import { Component, OnInit, OnDestroy, HostListener, ElementRef, ViewChild, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DragDropModule, CdkDragEnd, CdkDragMove } from '@angular/cdk/drag-drop';
import { Subscription } from 'rxjs';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { DiagramService } from '../../services/diagram.service';
import { DiagramToolbarComponent } from '../diagram-toolbar/diagram-toolbar.component';
import { DiagramState, Node, Tendril, Edge, Position, Size, BoundingBox, SvgImage, DiagramElement, isNode, isSvgImage, isBoundingBox } from '../../models/diagram.model';
import { PropertiesWindowComponent } from '../properties-window/properties-window.component';

@Component({
  selector: 'app-diagram-canvas',
  standalone: true,
  imports: [CommonModule, DragDropModule],
  templateUrl: './diagram-canvas.component.html',
  styleUrls: ['./diagram-canvas.component.sass']
})
export class DiagramCanvasComponent implements OnInit, OnDestroy {
  @ViewChild('canvas', { static: true }) canvas!: ElementRef<SVGElement>;
  @Input() propertiesWindow?: PropertiesWindowComponent;
  @Input() toolbar?: DiagramToolbarComponent;

  state!: DiagramState;
  private subscription!: Subscription;
  public forceUpdate = 0; // Used to force re-rendering of edge paths

  // For edge creation
  isCreatingEdge = false;
  private edgeStartNodeId?: string;
  private edgeStartTendrilId?: string;
  private tempEdgeEnd: Position = { x: 0, y: 0 };
  // Absolute canvas position used as the start of the temp edge line during
  // Ctrl+click edge creation (before the outgoing tendril is committed).
  private tempEdgeStartPosition?: Position;

  // For Ctrl+click edge creation
  public isCtrlEdgeMode = false;
  private ctrlEdgeStartElementId?: string;

  // For resizing
  private isResizing = false;
  private resizeNodeId?: string;
  private resizeBoundingBoxId?: string;
  private resizeSvgImageId?: string;
  private resizeStartPos: Position = { x: 0, y: 0 };
  private resizeStartSize: Size = { width: 0, height: 0 };

  // For Alt+click connector creation
  private altConnectorStartElementId?: string;

  // For drag highlighting
  private isDraggingBoundingBox = false;
  private highlightedObjectIds: Set<string> = new Set();

  // For live path routing during drag
  private movingElementIds = new Set<string>();
  private draggingDelta: Position = { x: 0, y: 0 };

  // Node shapes that support inner diagrams
  private readonly INNER_DIAGRAM_ALLOWED_SHAPES = ['rectangle', 'roundedRectangle', 'pill', 'cylinder', 'circle', 'wall', 'mq', 'cache'];

  supportsInnerDiagram(element: DiagramElement): boolean {
    if (isNode(element)) {
      return this.INNER_DIAGRAM_ALLOWED_SHAPES.includes(element.shape);
    }
    // Bounding boxes and SVG images also support inner diagrams
    return isBoundingBox(element) || isSvgImage(element);
  }

  // For canvas panning
  isPanning = false;
  private panStart: Position = { x: 0, y: 0 };
  viewOffset: Position = { x: 0, y: 0 };
  private currentDiagramId?: string;

  get svgViewBox(): string {
    const el = this.canvas?.nativeElement;
    const w = el && el.clientWidth ? el.clientWidth : 2000;
    const h = el && el.clientHeight ? el.clientHeight : 2000;
    return `${this.viewOffset.x} ${this.viewOffset.y} ${w} ${h}`;
  }

  constructor(private diagramService: DiagramService, private sanitizer: DomSanitizer) { }

  ngOnInit(): void {
    this.subscription = this.diagramService.state$.subscribe(state => {
      if (this.currentDiagramId && this.currentDiagramId !== state.currentDiagram.id) {
        this.viewOffset = { x: 0, y: 0 };
      }
      this.currentDiagramId = state.currentDiagram.id;
      this.state = state;
    });
    // Initial viewport update after view has settled
    setTimeout(() => this.updateServiceViewport(), 100);
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }

  // Canvas click - no longer creates nodes automatically
  onCanvasClick(event: MouseEvent): void {
    // Don't fire selection-clear if we just finished panning
    if (this.isPanning) return;

    // Don't clear if target was a tendril (handled separately)
    const target = event.target as Element;
    if (target.classList.contains('tendril') || target.classList.contains('propagated-tendril') || target.classList.contains('tendril-click-area')) {
      return;
    }

    // Clear all selections when clicking on empty canvas
    this.diagramService.clearSelection();

    // Close any open toolbar dropdowns
    if (this.toolbar) {
      this.toolbar.closeAllDropdowns();
    }
  }

  // Canvas pan handlers
  onCanvasMouseDown(event: MouseEvent): void {
    // Only pan on direct SVG background clicks (not propagated from child elements)
    if (event.target !== this.canvas.nativeElement &&
        !(event.target as Element).classList.contains('canvas-bg')) return;
    this.isPanning = true;
    this.panStart = { x: event.clientX + this.viewOffset.x, y: event.clientY + this.viewOffset.y };
    event.preventDefault();
  }

  onCanvasMouseMove(event: MouseEvent): void {
    if (!this.isPanning) return;
    this.viewOffset = {
      x: this.panStart.x - event.clientX,
      y: this.panStart.y - event.clientY
    };
    this.updateServiceViewport();
  }

  onCanvasMouseUp(event: MouseEvent): void {
    this.isPanning = false;
    this.updateServiceViewport();
  }

  // Unified element drag handling
  onElementDragStarted(element: DiagramElement): void {
    this.movingElementIds.clear();
    this.movingElementIds.add(element.id);
    this.draggingDelta = { x: 0, y: 0 };
  }

  onElementDragMoved(event: CdkDragMove): void {
    this.draggingDelta = {
      x: event.distance.x,
      y: event.distance.y
    };
  }

  onElementDragEnd(event: CdkDragEnd, element: DiagramElement): void {
    const elementRef = event.source.element.nativeElement;
    const transform = elementRef.style.transform;

    // Parse transform to get new position
    const match = transform.match(/translate3d\(([^,]+)px, ([^,]+)px,/);
    if (match) {
      const deltaX = parseFloat(match[1]);
      const deltaY = parseFloat(match[2]);

      const newPosition: Position = {
        x: element.position.x + deltaX,
        y: element.position.y + deltaY
      };

      if (isNode(element)) {
        this.diagramService.updateNode(element.id, { position: newPosition });
      } else if (isSvgImage(element)) {
        this.diagramService.updateSvgImage(element.id, { position: newPosition });
      }
    }

    // Clear highlights
    this.isDraggingBoundingBox = false;
    this.highlightedObjectIds.clear();
    this.movingElementIds.clear();
    this.draggingDelta = { x: 0, y: 0 };

    // Reset transform
    elementRef.style.transform = '';
  }

  // Unified element interaction methods
  onElementClick(event: MouseEvent, element: DiagramElement): void {
    // Skip if target is a tendril (handled by tendril click handler)
    const target = event.target as Element;
    if (target.classList.contains('tendril') || target.classList.contains('propagated-tendril') || target.classList.contains('tendril-click-area')) {
      return;
    }

    event.stopPropagation();

    // Only handle Ctrl+Click for edge creation if it's strictly a ctrl-click
    if (event.ctrlKey || event.metaKey) {
      if (event.altKey) {
        // Ctrl + Alt + Click as a fallback for Linux
        this.handleAltClick(element.id);
      } else {
        this.handleCtrlClick(element.id);
      }
    } else if (event.altKey) {
      this.handleAltClick(element.id);
    } else {
      const multiSelect = event.shiftKey; // User requested Shift+Click for multi-select
      if (isNode(element)) {
        this.diagramService.selectNode(element.id, multiSelect);
      } else if (isSvgImage(element)) {
        this.diagramService.selectSvgImage(element.id, multiSelect);
      } else if (isBoundingBox(element)) {
        this.diagramService.selectBoundingBox(element.id, multiSelect);
      }
    }
  }

  onElementDoubleClick(element: DiagramElement): void {
    // Only certain elements support inner diagrams
    if (!this.supportsInnerDiagram(element)) {
      return;
    }

    // If element doesn't have an inner diagram, create one
    if (!element.innerDiagram) {
      element.innerDiagram = this.diagramService.createInnerDiagram(element.id);
    }
    // Then navigate to it
    this.diagramService.enterNodeDiagram(element.id);
  }

  onElementContextMenu(event: MouseEvent, element: DiagramElement): void {
    event.preventDefault(); // Prevent default browser context menu
    event.stopPropagation();

    if (isNode(element)) {
      this.diagramService.selectNode(element.id, false); // Single select on right click
    } else if (isSvgImage(element)) {
      this.diagramService.selectSvgImage(element.id, false);
    }

    if (this.propertiesWindow) {
      this.propertiesWindow.open(event.clientX, event.clientY);
    }
  }

  onElementTendrilClick(event: MouseEvent, element: DiagramElement, tendril: Tendril): void {
    event.preventDefault();
    event.stopPropagation();

    if (this.isCreatingEdge) {
      // Complete edge creation - only allow connecting to incoming tendrils
      if (tendril.type === 'incoming' &&
        this.edgeStartNodeId && this.edgeStartTendrilId &&
        this.edgeStartNodeId !== element.id) {
        this.diagramService.addEdge(
          this.edgeStartNodeId,
          this.edgeStartTendrilId,
          element.id,
          tendril.id
        );
      }
      // Always stop edge creation after attempt
      this.isCreatingEdge = false;
      this.edgeStartNodeId = undefined;
      this.edgeStartTendrilId = undefined;
    } else if (event.ctrlKey || event.metaKey) {
      // Ctrl+click: Start edge creation from outgoing tendrils
      if (tendril.type === 'outgoing') {
        this.isCreatingEdge = true;
        this.edgeStartNodeId = element.id;
        this.edgeStartTendrilId = tendril.id;
      }
    } else {
      // Regular click: Select the tendril
      this.diagramService.selectTendril(element.id, tendril.id);
    }
  }

  onElementTendrilContextMenu(event: MouseEvent, element: DiagramElement, tendril: Tendril): void {
    event.preventDefault(); // Prevent default browser context menu
    event.stopPropagation();

    // Select the tendril
    this.diagramService.selectTendril(element.id, tendril.id);

    if (this.propertiesWindow) {
      this.propertiesWindow.open(event.clientX, event.clientY);
    }
  }

  // Legacy node drag handling for backward compatibility
  onNodeDragEnd(event: CdkDragEnd, node: Node): void {
    this.onElementDragEnd(event, node);
  }

  // Node double click to enter inner diagram
  onNodeDoubleClick(node: Node): void {
    // Only certain shapes support inner diagrams
    if (!this.supportsInnerDiagram(node)) {
      return;
    }

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
    } else if (event.ctrlKey || event.metaKey || this.isCtrlEdgeMode) {
      // Start edge creation - only allow from outgoing tendrils
      if (tendril.type === 'outgoing') {
        this.isCreatingEdge = true;
        this.edgeStartNodeId = node.id;
        this.edgeStartTendrilId = tendril.id;
      }
    } else {
      // Select the tendril
      this.diagramService.selectTendril(node.id, tendril.id);
    }
  }

  // Mouse move for temp edge rendering, resizing, and custom tendril dragging
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

      let newWidth = Math.max(50, this.resizeStartSize.width + deltaX);
      let newHeight = Math.max(30, this.resizeStartSize.height + deltaY);

      // Constrain resize for line shapes
      const node = this.diagramService.getNode(this.resizeNodeId);
      if (node) {
        if (node.shape === 'verticalLine') {
          newWidth = this.resizeStartSize.width; // Lock width
        } else if (node.shape === 'horizontalLine') {
          newHeight = this.resizeStartSize.height; // Lock height
        }
      }

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
      this.repositionTendrilsAfterResize(this.resizeSvgImageId, finalWidth, finalHeight);
    }
  }

  // Mouse up to stop resizing and custom tendril dragging
  @HostListener('document:mouseup', ['$event'])
  onMouseUp(event: MouseEvent): void {
    if (this.isResizing) {
      this.isResizing = false;
      this.resizeNodeId = undefined;
      this.resizeBoundingBoxId = undefined;
      this.resizeSvgImageId = undefined;
    }
  }

  // Cancel an in-progress edge creation.
  // For Ctrl+click mode, no tendril was committed yet, so there's nothing to delete.
  private cancelEdgeCreation(): void {
    this.isCreatingEdge = false;
    this.edgeStartNodeId = undefined;
    this.edgeStartTendrilId = undefined;
    this.tempEdgeStartPosition = undefined;
    this.ctrlEdgeStartElementId = undefined;
  }

  // Right click to cancel edge creation
  @HostListener('document:contextmenu', ['$event'])
  onRightClick(event: MouseEvent): void {
    if (this.isCreatingEdge) {
      event.preventDefault();
      this.cancelEdgeCreation();
    }
  }

  // Keyboard shortcuts for deletion, undo, save, and Ctrl key tracking
  @HostListener('document:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    // Handle Ctrl+Z (or Cmd+Z on macOS) for undo
    if ((event.ctrlKey || event.metaKey) && event.key === 'z') {
      event.preventDefault();
      const warning = this.diagramService.getUndoWarning();
      if (warning && !confirm(warning)) {
        return; // User chose to keep the nested diagram
      }
      this.diagramService.undo();
      return;
    }

    // Handle Ctrl+A (or Cmd+A on macOS) for select all
    if ((event.ctrlKey || event.metaKey) && event.key === 'a') {
      event.preventDefault();
      this.diagramService.selectAll();
      return;
    }

    // Handle Ctrl+S (or Cmd+S on macOS) for save
    if ((event.ctrlKey || event.metaKey) && event.key === 's') {
      event.preventDefault();
      this.saveDiagram();
      return;
    }

    if (event.key === 'Delete') {
      // Handle Tendril deletion separately to prevent deleting the parent node
      if (this.state.selectedTendrilId) {
        const tendrilId = this.state.selectedTendrilId;
        this.state.selectedNodeIds.forEach(nodeId => {
          this.diagramService.deleteTendril(nodeId, tendrilId);
        });
        this.state.selectedSvgImageIds.forEach(svgId => {
          this.diagramService.deleteTendril(svgId, tendrilId);
        });
        this.diagramService.clearSelection();
        return;
      }

      // Check if we are deleting EVERYTHING
      const totalElements = this.state.currentDiagram.elements.length +
                            this.state.currentDiagram.boundingBoxes.length +
                            this.state.currentDiagram.edges.length +
                            (this.state.currentDiagram.connectors || []).length;

      const selectedElements = this.state.selectedNodeIds.length +
                               this.state.selectedBoundingBoxIds.length +
                               this.state.selectedSvgImageIds.length +
                               this.state.selectedEdgeIds.length +
                               (this.state.selectedConnectorIds || []).length;

      if (totalElements > 0 && selectedElements === totalElements) {
         if (!confirm('Are you sure you want to clear the canvas? All unsaved progress will be lost.')) {
            return;
         }
      }

      // Delete all selected items
      this.state.selectedNodeIds.forEach(nodeId => {
        this.diagramService.deleteNode(nodeId);
      });

      this.state.selectedBoundingBoxIds.forEach(boxId => {
        this.diagramService.deleteBoundingBox(boxId);
      });

      this.state.selectedSvgImageIds.forEach(svgId => {
        this.diagramService.deleteNode(svgId);
      });

      this.state.selectedEdgeIds.forEach(edgeId => {
        this.diagramService.deleteEdge(edgeId);
      });

      (this.state.selectedConnectorIds || []).forEach(connectorId => {
        this.diagramService.deleteConnector(connectorId);
      });

      // Clear selections after deletion
      this.diagramService.clearSelection();
    }

    if (event.key === 'Control' || event.key === 'Meta') {
      this.isCtrlEdgeMode = true;
    }

    if (event.key === 'Alt') {
      // Logic removed as we use event.altKey in click handlers
    }

    // Copy (Ctrl+C)
    if ((event.ctrlKey || event.metaKey) && event.key === 'c') {
      event.preventDefault();
      this.diagramService.copySelection();
      return;
    }

    // Paste (Ctrl+V)
    if ((event.ctrlKey || event.metaKey) && event.key === 'v') {
      event.preventDefault();
      this.diagramService.pasteClipboard();
      return;
    }
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    this.updateServiceViewport();
  }

  private updateServiceViewport(): void {
    const el = this.canvas?.nativeElement;
    if (!el) return;

    const w = el.clientWidth;
    const h = el.clientHeight;

    // The viewport center in SVG coordinates is the viewOffset plus half the client dimensions
    // Since our SVG viewBox starts at viewOffset and spans clientWidth/Height
    const center: Position = {
      x: this.viewOffset.x + (w / 2),
      y: this.viewOffset.y + (h / 2)
    };

    this.diagramService.updateViewportCenter(center);
  }

  @HostListener('document:keyup', ['$event'])
  onKeyUp(event: KeyboardEvent): void {
    if (event.key === 'Control' || event.key === 'Meta') {
      this.isCtrlEdgeMode = false;
      // Cancel any pending Ctrl edge creation, cleaning up the auto-created tendril
      if (this.isCreatingEdge) {
        this.cancelEdgeCreation();
      }
      this.ctrlEdgeStartElementId = undefined;
    }

    if (event.key === 'Alt') {
      this.altConnectorStartElementId = undefined;
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

    if (event.ctrlKey || event.metaKey) {
      this.handleCtrlClick(node.id);
    } else {
      this.diagramService.selectNode(node.id);
    }
  }

  // Context menu for nodes
  onNodeContextMenu(event: MouseEvent, node: Node): void {
    event.preventDefault();
    event.stopPropagation();
    this.diagramService.selectNode(node.id, false);

    if (this.propertiesWindow) {
      this.propertiesWindow.open(event.clientX, event.clientY);
    }
  }

  // Context menu for tendrils - now selects immediately
  onTendrilContextMenu(event: MouseEvent, node: Node, tendril: Tendril): void {
    event.preventDefault();
    event.stopPropagation();
    this.diagramService.selectTendril(node.id, tendril.id);

    if (this.propertiesWindow) {
      this.propertiesWindow.open(event.clientX, event.clientY);
    }
  }

  // Bounding box click to select
  onBoundingBoxClick(event: MouseEvent, box: any): void {
    event.stopPropagation();
    const multiSelect = event.ctrlKey || event.metaKey; // Support both Ctrl and Cmd
    this.diagramService.selectBoundingBox(box.id, multiSelect);
  }

  // Context menu for bounding boxes
  onBoundingBoxContextMenu(event: MouseEvent, box: any): void {
    event.preventDefault();
    event.stopPropagation();
    this.diagramService.selectBoundingBox(box.id);

    if (this.propertiesWindow) {
      this.propertiesWindow.open(event.clientX, event.clientY);
    }
  }

  // Bounding box drag started - highlight contained objects
  onBoundingBoxDragStarted(box: any): void {
    this.isDraggingBoundingBox = true;
    this.highlightedObjectIds.clear();
    this.movingElementIds.clear();
    this.movingElementIds.add(box.id);
    this.draggingDelta = { x: 0, y: 0 };

    // Highlight all elements within the bounding box
    this.state.currentDiagram.elements.forEach(element => {
      if (this.isElementInsideBoundingBox(element, box)) {
        this.movingElementIds.add(element.id);
        if (isNode(element)) {
          this.highlightedObjectIds.add(`node-${element.id}`);
        } else if (isSvgImage(element)) {
          this.highlightedObjectIds.add(`svg-${element.id}`);
        }
      }
    });

    // Highlight all bounding boxes within this bounding box
    this.state.currentDiagram.boundingBoxes.forEach(otherBox => {
      if (otherBox.id !== box.id && this.isBoundingBoxInsideBoundingBox(otherBox, box)) {
        this.movingElementIds.add(otherBox.id);
        this.highlightedObjectIds.add(`box-${otherBox.id}`);
      }
    });
  }

  // Bounding box drag moved - update highlights if needed
  onBoundingBoxDragMoved(event: CdkDragMove, box: any): void {
    this.draggingDelta = {
      x: event.distance.x,
      y: event.distance.y
    };
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

      // Move all elements within the bounding box
      this.state.currentDiagram.elements.forEach(element => {
        if (this.isElementInsideBoundingBox(element, box)) {
          const newElementPosition: Position = {
            x: element.position.x + deltaX,
            y: element.position.y + deltaY
          };

          if (isNode(element)) {
            this.diagramService.updateNode(element.id, { position: newElementPosition });
          } else if (isSvgImage(element)) {
            this.diagramService.updateSvgImage(element.id, { position: newElementPosition });
          }
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

    this.movingElementIds.clear();
    this.draggingDelta = { x: 0, y: 0 };

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
    // Get the elements
    const fromElement = this.getElementAny(edge.fromNodeId);
    const toElement = this.getElementAny(edge.toNodeId);

    if (!fromElement || !toElement) return '';

    // Calculate live centroids (considering drag delta)
    const fromC = this.getLiveCentroid(fromElement);
    const toC = this.getLiveCentroid(toElement);

    // Calculate live intersection points on the borders
    const start = this.getLiveGlobalIntersection(fromElement, toC);
    const end = this.getLiveGlobalIntersection(toElement, fromC);

    // Shortest straight line
    return `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
  }

  // Get two path segments with a gap in the middle for labeled edges
  getEdgePathSegments(edge: Edge): { first: string, second: string } | null {
    // Get the elements
    const fromElement = this.getElementAny(edge.fromNodeId);
    const toElement = this.getElementAny(edge.toNodeId);

    if (!fromElement || !toElement || !edge.name) return null;

    // Calculate live centroids
    const fromC = this.getLiveCentroid(fromElement);
    const toC = this.getLiveCentroid(toElement);

    // Calculate live intersection points
    const start = this.getLiveGlobalIntersection(fromElement, toC);
    const end = this.getLiveGlobalIntersection(toElement, fromC);

    const midX = (start.x + end.x) / 2;
    const midY = (start.y + end.y) / 2;

    // Calculate gap size based on text width
    const fontSize = 12;
    const charWidth = fontSize * 0.6;
    const textWidth = edge.name.length * charWidth;
    const gapSize = Math.max(textWidth / 2 + 5, 20);

    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.sqrt(dx * dx + dy * dy);

    if (length === 0) return null;

    const ux = dx / length;
    const uy = dy / length;

    // Points for the gap
    const gapStartX = midX - ux * gapSize;
    const gapStartY = midY - uy * gapSize;
    const gapEndX = midX + ux * gapSize;
    const gapEndY = midY + uy * gapSize;

    return {
      first: `M ${start.x} ${start.y} L ${gapStartX} ${gapStartY}`,
      second: `M ${gapEndX} ${gapEndY} L ${end.x} ${end.y}`
    };
  }

  getTempEdgePath(): string {
    if (!this.isCreatingEdge) return '';

    // Ctrl+click path: use the pre-computed canvas start position
    if (this.tempEdgeStartPosition) {
      const s = this.tempEdgeStartPosition;
      return `M ${s.x} ${s.y} L ${this.tempEdgeEnd.x} ${this.tempEdgeEnd.y}`;
    }

    // Manual tendril-click path: look up the tendril in state
    if (!this.edgeStartNodeId || !this.edgeStartTendrilId) return '';
    const startElement = this.getElementAny(this.edgeStartNodeId);
    if (!startElement) return '';
    const startTendril = this.getTendrilFromElement(startElement, this.edgeStartTendrilId);
    if (!startTendril) return '';
    const start = this.getAbsoluteTendrilPositionAny(startElement, startTendril);
    return `M ${start.x} ${start.y} L ${this.tempEdgeEnd.x} ${this.tempEdgeEnd.y}`;
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

  // Get X position for node text based on shape
  getNodeTextX(node: any): number {
    if (node.shape === 'text') {
      // Position text at the left edge for text-only nodes
      return node.position.x + 5;
    } else {
      // Center text horizontally for all other shapes
      return node.position.x + node.size.width / 2;
    }
  }

  // Get Y position for node text based on shape
  getNodeTextY(node: any): number {
    // Shapes that display text INSIDE the shape
    const insideShapes = ['pill', 'rectangle', 'diamond', 'trapezoid', 'roundedRectangle', 'hexagon', 'parallelogram', 'process', 'note', 'cloud'];

    if (insideShapes.includes(node.shape)) {
      // Center text within the shape
      return node.position.y + node.size.height / 2;
    } else if (node.shape === 'circle' || node.shape === 'cylinder' || node.shape === 'wall') {
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
      // Default: position below the shape for any other shapes
      return node.position.y + node.size.height + 25;
    }
  }

  // Get text anchor for node text based on shape
  getNodeTextAnchor(node: any): string {
    if (node.shape === 'text') {
      // Left-align text for text-only nodes
      return 'start';
    } else {
      // Center-align text for all other shapes
      return 'middle';
    }
  }

  // Get baseline alignment for node text based on shape
  getNodeTextBaseline(node: any): string {
    // Shapes that display text INSIDE the shape
    const insideShapes = ['pill', 'rectangle', 'diamond', 'trapezoid', 'roundedRectangle', 'hexagon', 'parallelogram', 'process', 'note'];

    if (insideShapes.includes(node.shape)) {
      // Center alignment for within-shape positioning
      return 'middle';
    } else {
      // Align to top of text for below-shape positioning
      return 'hanging';
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

  onDiagramTitleChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const newName = input.value.trim();
    if (newName) {
      this.diagramService.updateCurrentDiagramName(newName);
    }
  }

  onDiagramTitleEnterKey(event: Event): void {
    const input = event.target as HTMLInputElement;
    input.blur();
  }

  // Check if an object is highlighted during drag
  isHighlighted(objectType: string, objectId: string): boolean {
    if (this.altConnectorStartElementId === objectId || (objectType === 'svg' && this.altConnectorStartElementId === `svg-${objectId}`)) {
      return true;
    }
    return this.highlightedObjectIds.has(`${objectType}-${objectId}`);
  }

  // Check if an element is selected (for multi-selection support)
  isSelected(elementType: string, elementId: string): boolean {
    switch (elementType) {
      case 'node':
        return this.state.selectedNodeIds.includes(elementId) && !this.state.selectedTendrilId;
      case 'svg':
        return this.state.selectedSvgImageIds.includes(elementId) && !this.state.selectedTendrilId;
      case 'boundingBox':
        return this.state.selectedBoundingBoxIds.includes(elementId);
      case 'edge':
        return this.state.selectedEdgeIds.includes(elementId);
      case 'connector':
        return this.state.selectedConnectorIds?.includes(elementId) || false;
      case 'tendril':
        return this.state.selectedTendrilId === elementId;
      default:
        return false;
    }
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

  // Check if an element is inside a bounding box
  private isElementInsideBoundingBox(element: DiagramElement, boundingBox: any): boolean {
    const elementLeft = element.position.x;
    const elementRight = element.position.x + element.size.width;
    const elementTop = element.position.y;
    const elementBottom = element.position.y + element.size.height;

    const boxLeft = boundingBox.position.x;
    const boxRight = boundingBox.position.x + boundingBox.size.width;
    const boxTop = boundingBox.position.y;
    const boxBottom = boundingBox.position.y + boundingBox.size.height;

    return elementLeft >= boxLeft && elementRight <= boxRight &&
      elementTop >= boxTop && elementBottom <= boxBottom;
  }

  // Check if an SVG image is inside a bounding box
  private isSvgImageInsideBoundingBox(svgImage: any, boundingBox: any): boolean {
    const svgLeft = svgImage.position.x;
    const svgRight = svgImage.position.x + svgImage.size.width;
    const svgTop = svgImage.position.y;
    const svgBottom = svgImage.position.y + svgImage.size.height;

    const boxLeft = boundingBox.position.x;
    const boxRight = boundingBox.position.x + boundingBox.size.width;
    const boxTop = boundingBox.position.y;
    const boxBottom = boundingBox.position.y + boundingBox.size.height;

    return svgLeft >= boxLeft && svgRight <= boxRight &&
      svgTop >= boxTop && svgBottom <= boxBottom;
  }

  // Edge click to select
  onEdgeClick(event: MouseEvent, edge: Edge): void {
    event.stopPropagation();
    const multiSelect = event.ctrlKey || event.metaKey; // Support both Ctrl and Cmd
    this.diagramService.selectEdge(edge.id, multiSelect);
  }

  // Edge context menu
  onEdgeContextMenu(event: MouseEvent, edge: Edge): void {
    event.preventDefault();
    event.stopPropagation();
    this.diagramService.selectEdge(edge.id, false); // Single select on right click

    if (this.propertiesWindow) {
      this.propertiesWindow.open(event.clientX, event.clientY);
    }
  }

  // Check if a tendril has a connected edge with a name
  hasEdgeName(elementId: string, tendrilId: string): boolean {
    return this.state.currentDiagram.edges.some(edge => {
      // Check direct matches
      const fromMatch = (edge.fromNodeId === elementId && edge.fromTendrilId === tendrilId);
      const toMatch = (edge.toNodeId === elementId && edge.toTendrilId === tendrilId);

      return (fromMatch || toMatch) &&
        edge.name && edge.name.trim() !== '';
    });
  }

  // Check if a propagated tendril has a connected edge
  hasPropagatedEdgeName(nodeId: string, tendrilId: string): boolean {
    // For propagated tendrils, we need to check if the original tendril in the inner diagram has an edge
    const node = this.state.currentDiagram.elements.find(e => e.id === nodeId && isNode(e)) as Node;
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



  // Reposition tendrils to stay on borders after element resize
  private repositionTendrilsAfterResize(elementId: string, newWidth: number, newHeight: number): void {
    const element = this.state.currentDiagram.elements.find(e => e.id === elementId);
    if (!element) return;

    // Separate incoming and outgoing tendrils
    const incomingTendrils = element.tendrils.filter(t => t.type === 'incoming');
    const outgoingTendrils = element.tendrils.filter(t => t.type === 'outgoing');

    // Reposition incoming tendrils along left edge
    incomingTendrils.forEach((tendril, index) => {
      const spacing = newHeight / (incomingTendrils.length + 1);
      const y = spacing * (index + 1); // Distribute evenly

      this.diagramService.updateTendril(elementId, tendril.id, {
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

      this.diagramService.updateTendril(elementId, tendril.id, {
        position: {
          x: newWidth, // Right border
          y: Math.max(10, Math.min(newHeight - 10, y)) // Keep within bounds
        }
      });
    });
  }

  getBoundingBoxes(): BoundingBox[] {
    if (this.state.currentDiagram && this.state.currentDiagram.boundingBoxes) {
      return this.state.currentDiagram.boundingBoxes
    }

    return [];
  }

  getCurrentEdges(): Edge[] {
    return this.state.currentDiagram?.edges || [];
  }

  getCurrentConnectors(): import('../../models/diagram.model').Connector[] {
    return this.state.currentDiagram?.connectors || [];
  }

  onConnectorClick(event: MouseEvent, connector: import('../../models/diagram.model').Connector): void {
    event.stopPropagation();
    const multiSelect = event.shiftKey;
    this.diagramService.selectConnector(connector.id, multiSelect);
  }

  onConnectorContextMenu(event: MouseEvent, connector: import('../../models/diagram.model').Connector): void {
    event.preventDefault();
    event.stopPropagation();
    this.diagramService.selectConnector(connector.id, false);

    if (this.propertiesWindow) {
      this.propertiesWindow.open(event.clientX, event.clientY);
    }
  }

  getConnectorPath(connector: import('../../models/diagram.model').Connector): string {
    const fromEl = this.diagramService.getElement(connector.fromNodeId);
    const toEl = this.diagramService.getElement(connector.toNodeId);

    if (!fromEl || !toEl) return '';

    const fromC = this.getLiveCentroid(fromEl);
    const toC = this.getLiveCentroid(toEl);

    const start = this.getLiveGlobalIntersection(fromEl, toC);
    const end = this.getLiveGlobalIntersection(toEl, fromC);

    return `M ${start.x},${start.y} L ${end.x},${end.y}`;
  }

  getConnectorLabelPosition(connector: import('../../models/diagram.model').Connector): Position {
    const fromEl = this.diagramService.getElement(connector.fromNodeId);
    const toEl = this.diagramService.getElement(connector.toNodeId);

    if (!fromEl || !toEl) return { x: 0, y: 0 };

    const fromC = this.getLiveCentroid(fromEl);
    const toC = this.getLiveCentroid(toEl);

    const start = this.getLiveGlobalIntersection(fromEl, toC);
    const end = this.getLiveGlobalIntersection(toEl, fromC);

    return {
      x: (start.x + end.x) / 2,
      y: (start.y + end.y) / 2
    };
  }

  private handleAltClick(elementId: string): void {
    if (!this.altConnectorStartElementId) {
      this.altConnectorStartElementId = elementId;
    } else if (this.altConnectorStartElementId !== elementId) {
      this.diagramService.addConnector(this.altConnectorStartElementId, elementId);
      this.altConnectorStartElementId = undefined;
      // If we were in persistent mode, maybe we stay in it?
      // User might want to draw multiple. But usually one at a time.
      // Let's keep it for now.
    }
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

    if (this.isCtrlEdgeMode || event.ctrlKey || event.metaKey) {
      this.handleCtrlClick(`svg-${svgImage.id}`);
    } else if (event.altKey) {
      this.handleAltClick(`svg-${svgImage.id}`);
    } else {
      this.diagramService.selectSvgImage(svgImage.id, event.shiftKey);
    }
  }

  // SVG image context menu
  onSvgImageContextMenu(event: MouseEvent, svgImage: SvgImage): void {
    event.preventDefault();
    event.stopPropagation();
    this.diagramService.selectSvgImage(svgImage.id, false); // Single select

    if (this.propertiesWindow) {
      this.propertiesWindow.open(event.clientX, event.clientY);
    }
  }

  // SVG tendril click
  onSvgTendrilClick(event: MouseEvent, svgImage: SvgImage, tendril: Tendril): void {
    event.stopPropagation();

    if (this.isCreatingEdge) {
      // Complete edge creation - only allow connecting to incoming tendrils
      if (tendril.type === 'incoming' &&
        this.edgeStartNodeId && this.edgeStartTendrilId &&
        this.edgeStartNodeId !== svgImage.id) { // Ensure not connecting to itself
        this.diagramService.addEdge(
          this.edgeStartNodeId,
          this.edgeStartTendrilId,
          svgImage.id,
          tendril.id
        );
      }
      // Always stop edge creation after attempt
      this.isCreatingEdge = false;
      this.edgeStartNodeId = undefined;
      this.edgeStartTendrilId = undefined;
    } else if (event.ctrlKey || event.metaKey || this.isCtrlEdgeMode) {
      // Start edge creation - only allow from outgoing tendrils
      if (tendril.type === 'outgoing') {
        this.isCreatingEdge = true;
        this.edgeStartNodeId = svgImage.id;
        this.edgeStartTendrilId = tendril.id;
      }
    } else {
      // Select the tendril
      this.diagramService.selectTendril(svgImage.id, tendril.id);
    }
  }

  // SVG tendril context menu
  onSvgTendrilContextMenu(event: MouseEvent, svgImage: SvgImage, tendril: Tendril): void {
    event.preventDefault();
    event.stopPropagation();
    this.diagramService.selectTendril(`svg-${svgImage.id}`, tendril.id);

    if (this.propertiesWindow) {
      this.propertiesWindow.open(event.clientX, event.clientY);
    }
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
  private getElementAny(elementId: string): DiagramElement | undefined {
    // Check if it's a regular element
    const element = this.state.currentDiagram.elements.find(e => e.id === elementId);
    if (element) return element;

    // Check if it's an SVG image with "svg-" prefix
    if (elementId.startsWith('svg-')) {
      const svgImageId = elementId.substring(4);
      return this.state.currentDiagram.elements.find(e => e.id === svgImageId);
    }

    return undefined;
  }

  // Get tendril from any element (node or SVG image)
  private getTendrilFromElement(element: DiagramElement, tendrilId: string): Tendril | undefined {
    // First check if it's a regular tendril on the element
    const regularTendril = element.tendrils.find(t => t.id === tendrilId);
    if (regularTendril) return regularTendril;

    // Check if it's a propagated tendril (only for nodes)
    if (isNode(element) && this.isPropagatedTendril(element.id, tendrilId)) {
      const propagatedTendrils = this.getPropagatedTendrils(element);
      return propagatedTendrils.find(t => t.id === tendrilId);
    }

    return undefined;
  }

  // Get absolute tendril position with live tracking and auto-routing support
  private getAbsoluteTendrilPositionAny(element: DiagramElement, tendril: Tendril): Position {
    let x = element.position.x;
    let y = element.position.y;

    if (this.movingElementIds.has(element.id)) {
      x += this.draggingDelta.x;
      y += this.draggingDelta.y;
    }

    // Centroid-linked logic (highest priority for straight lines)
    const edge = this.state.currentDiagram.edges.find(e =>
      (e.fromNodeId === element.id && e.fromTendrilId === tendril.id) ||
      (e.toNodeId === element.id && e.toTendrilId === tendril.id)
    );

    if (edge) {
      const otherId = edge.fromNodeId === element.id ? edge.toNodeId : edge.fromNodeId;
      const otherEl = this.getElementAny(otherId);
      if (otherEl) {
        const otherC = this.getLiveCentroid(otherEl);
        return this.getLiveGlobalIntersection(element, otherC);
      }
    }

    // Propagated tendril logic (fallback)
    if (tendril.id.includes('-') && this.isPropagatedTendril(element.id, tendril.id)) {
      const liveNode = { ...element, position: { x, y } };
      const propagatedTendrils = this.getPropagatedTendrils(liveNode as Node);
      const index = propagatedTendrils.findIndex(t => t.id === tendril.id);
      const pos = this.getPropagatedTendrilPosition(liveNode as Node, index);
      return pos || { x: x + tendril.position.x, y: y + tendril.position.y };
    }

    return {
      x: x + tendril.position.x,
      y: y + tendril.position.y
    };
  }

  // Get position for edge label (on the edge center)
  getEdgeLabelPosition(edge: Edge): Position {
    return this.getEdgeCenter(edge);
  }

  // Get center point of an edge for label positioning
  getEdgeCenter(edge: Edge): Position {
    const fromElement = this.getElementAny(edge.fromNodeId);
    const toElement = this.getElementAny(edge.toNodeId);

    if (!fromElement || !toElement) return { x: 0, y: 0 };

    const fromC = this.getLiveCentroid(fromElement);
    const toC = this.getLiveCentroid(toElement);

    const start = this.getLiveGlobalIntersection(fromElement, toC);
    const end = this.getLiveGlobalIntersection(toElement, fromC);

    return {
      x: (start.x + end.x) / 2,
      y: (start.y + end.y) / 2
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

    // Callout pointer: triangular pointer extending from right side
    const pointerBaseY = y + h * 0.4; // Middle of right side
    const pointerTipX = x + w + 15; // Extend 15px to the right
    const pointerTopY = pointerBaseY - 8;
    const pointerBottomY = pointerBaseY + 8;

    return `${x + w},${pointerTopY} ${pointerTipX},${pointerBaseY} ${x + w},${pointerBottomY}`;
  }

  getWallTopFacePoints(node: any): string {
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

  getWallSideFacePoints(node: any): string {
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

  // Calculate SVG path for Cloud shape
  getCloudPath(node: any): string {
    const x = node.position.x;
    const y = node.position.y;
    const w = node.size.width;
    const h = node.size.height;

    // Based on a relative coordinate system scaled to width and height
    const startX = x + w * 0.15;
    const startY = y + h * 0.7;

    // A classic 6-bubble cloud path using cubic beziers
    return `M ${startX} ${startY}
            c ${-w*0.2},0 ${-w*0.2},${-h*0.4} ${0},${-h*0.4}
            c ${0},${-h*0.3} ${w*0.3},${-h*0.3} ${w*0.35},${-h*0.1}
            c ${w*0.15},${-h*0.3} ${w*0.4},${-h*0.1} ${w*0.4},${h*0.1}
            c ${w*0.2},0 ${w*0.2},${h*0.4} ${0},${h*0.4}
            c 0,${h*0.3} ${-w*0.25},${h*0.3} ${-w*0.3},${h*0.1}
            c ${-w*0.1},${h*0.2} ${-w*0.4},${h*0.2} ${-w*0.45},${-h*0.1} Z`;
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

  getCylinderPath(node: any): string {
    const x = node.position.x;
    const y = node.position.y;
    const w = node.size.width;
    const h = node.size.height;
    const ry = Math.min(w, h) * 0.15;
    const rx = w / 2;

    return `M ${x},${y + ry} L ${x},${y + h - ry} A ${rx},${ry} 0 0 0 ${x + w},${y + h - ry} L ${x + w},${y + ry} Z`;
  }

  getCylinderRy(node: any): number {
    return Math.min(node.size.width, node.size.height) * 0.15;
  }

  getCacheBackPath(node: any): string {
    const x = node.position.x;
    const y = node.position.y;
    const w = node.size.width;
    const h = node.size.height;
    const rx = w / 4;
    const ry = h * 0.1;
    const cy1 = y + ry;
    const barrelH = h * 0.6;
    return `M ${x},${cy1} v ${barrelH} a ${rx},${ry} 0 0 0 ${2*rx},0 v -${barrelH}`;
  }

  getCacheFrontPath(node: any): string {
    const x = node.position.x;
    const y = node.position.y;
    const w = node.size.width;
    const h = node.size.height;
    const rx = w / 4;
    const ry = h * 0.1;
    const cy2 = y + h * 0.3;
    const barrelH = h * 0.6;
    const x2 = x + 2*rx;
    return `M ${x2},${cy2} v ${barrelH} a ${rx},${ry} 0 0 0 ${2*rx},0 v -${barrelH}`;
  }

  getCacheLightningPoints(node: any): string {
    const x = node.position.x;
    const y = node.position.y;
    const w = node.size.width;
    const h = node.size.height;
    const pts = [
      [17.5, 13], [14, 17], [16, 17], [14.5, 21], [18, 17], [16, 17]
    ];
    return pts.map(p => `${x + (p[0] - 4) * (w / 16)},${y + (p[1] - 4) * (h / 20)}`).join(' ');
  }

  getTickPoints(node: any): string {
    const x = node.position.x;
    const y = node.position.y;
    const w = node.size.width;
    const h = node.size.height;
    return `${x + w * 0.16},${y + h * 0.5} ${x + w * 0.38},${y + h * 0.71} ${x + w * 0.83},${y + h * 0.25}`;
  }

  getCrossPoints(node: any): { p1: string, p2: string } {
    const x = node.position.x;
    const y = node.position.y;
    const w = node.size.width;
    const h = node.size.height;
    const padding = Math.min(w, h) * 0.1;
    return {
      p1: `${x + padding},${y + padding} ${x + w - padding},${y + h - padding}`,
      p2: `${x + w - padding},${y + padding} ${x + padding},${y + h - padding}`
    };
  }

  getStarPoints(node: any): string {
    const x = node.position.x + node.size.width / 2;
    const y = node.position.y + node.size.height / 2;
    const outerRadius = Math.min(node.size.width, node.size.height) / 2;
    const innerRadius = outerRadius * 0.4;
    const points: string[] = [];

    for (let i = 0; i < 10; i++) {
        const radius = i % 2 === 0 ? outerRadius : innerRadius;
        const angle = (i * Math.PI) / 5 - Math.PI / 2;
        points.push(`${x + radius * Math.cos(angle)},${y + radius * Math.sin(angle)}`);
    }

    return points.join(' ');
  }

  getSmileyMouthPath(node: any): string {
    const x = node.position.x + node.size.width / 2;
    const y = node.position.y + node.size.height / 2;
    const w = node.size.width;
    const h = node.size.height;
    const rx = w * 0.15;
    const ry = h * 0.15;
    const mouthY = y + h * 0.15;
    // Semi-circle/arc for the mouth
    return `M ${x - rx},${mouthY} A ${rx},${ry} 0 0 0 ${x + rx},${mouthY}`;
  }

  getSmileyRadius(node: any): number {
    return Math.min(node.size.width, node.size.height) / 2;
  }

  getSmileyEyeRadius(node: any): number {
    return Math.min(node.size.width, node.size.height) * 0.05;
  }

  getDonutPath(node: any): string {
    const x = node.position.x + node.size.width / 2;
    const y = node.position.y + node.size.height / 2;
    const r1 = Math.min(node.size.width, node.size.height) / 2;
    const r2 = r1 * 0.5;

    // Path with two concentric circles to create a hole
    return `M ${x},${y - r1} A ${r1},${r1} 0 1 0 ${x},${y + r1} A ${r1},${r1} 0 1 0 ${x},${y - r1} ` +
           `M ${x},${y - r2} A ${r2},${r2} 0 1 1 ${x},${y + r2} A ${r2},${r2} 0 1 1 ${x},${y - r2} Z`;
  }

  getLightningPath(node: any): string {
    const x = node.position.x;
    const y = node.position.y;
    const w = node.size.width;
    const h = node.size.height;

    // Standard lightning bolt points normalized to 24x24 viewBox
    const pts = [
      [13, 2], [3, 14], [12, 14], [11, 22], [21, 10], [12, 10]
    ];

    const path = pts.map((p, i) => {
      const px = x + (p[0] / 24) * w;
      const py = y + (p[1] / 24) * h;
      return `${i === 0 ? 'M' : 'L'} ${px} ${py}`;
    }).join(' ');

    return path + ' Z';
  }

  // Premium Note shape methods
  getNoteMainPath(node: any): string {
    const x = node.position.x;
    const y = node.position.y;
    const w = node.size.width;
    const h = node.size.height;
    const r = 10;
    return `M ${x+r},${y} L ${x+w-r},${y} Q ${x+w},${y} ${x+w},${y+r} L ${x+w},${y+h-r} Q ${x+w},${h+y} ${x+w-r},${y+h} L ${x+r},${y+h} Q ${x},${y+h} ${x},${y+h-r} L ${x},${y+r} Q ${x},${y} ${x+r},${y} Z`;
  }


  getNoteShadowPath(node: any): string {
    const x = node.position.x;
    const y = node.position.y;
    const w = node.size.width;
    const h = node.size.height;
    const r = 10;
    return `M ${x+r},${y} L ${x+w-r},${y} Q ${x+w},${y} ${x+w},${y+r} L ${x+w},${y+h-r} Q ${x+w},${y+h} ${x+w-r},${y+h} L ${x+r},${y+h} Q ${x},${y+h} ${x},${y+h-r} L ${x},${y+r} Q ${x},${y} ${x+r},${y} Z`;
  }

  getMQPath(node: any): string {
    const x = node.position.x;
    const y = node.position.y;
    const w = node.size.width;
    const h = node.size.height;
    const arrowWidth = Math.min(20, w * 0.2); // Pointy bit width

    return `M ${x} ${y} L ${x + w - arrowWidth} ${y} L ${x + w} ${y + h / 2} L ${x + w - arrowWidth} ${y + h} L ${x} ${y + h} Z`;
  }

  getVaultPath(node: any): string {
    const x = node.position.x;
    const y = node.position.y;
    const w = node.size.width;
    const h = node.size.height;
    const r = 4;
    // Square with rounded corners and a dial
    return `M ${x+r},${y} L ${x+w-r},${y} Q ${x+w},${y} ${x+w},${y+r} L ${x+w},${y+h-r} Q ${x+w},${y+h} ${x+w-r},${y+h} L ${x+r},${y+h} Q ${x},${y+h} ${x},${y+h-r} L ${x},${y+r} Q ${x},${y} ${x+r},${y} Z`;
  }

  getPadlockBodyPath(node: any): string {
    const x = node.position.x;
    const y = node.position.y + node.size.height * 0.4;
    const w = node.size.width;
    const h = node.size.height * 0.6;
    const r = 4;

    return `M ${x+r},${y} L ${x+w-r},${y} Q ${x+w},${y} ${x+w},${y+r} L ${x+w},${y+h-r} Q ${x+w},${y+h} ${x+w-r},${y+h} L ${x+r},${y+h} Q ${x},${y+h} ${x},${y+h-r} L ${x},${y+r} Q ${x},${y} ${x+r},${y} Z`;
  }

  getPadlockShacklePath(node: any): string {
    const w = node.size.width;
    const h = node.size.height;
    const cx = node.position.x + w / 2;
    const r = w * 0.2; // Optimized radius for 100px width
    const bottom = node.position.y + h * 0.45;
    const peak = node.position.y + h * 0.05;
    const arcTop = peak + r; // Meeting point for vertical lines and arc

    if (node.locked === false) { // Unlocked state
      return `M ${cx - r},${bottom} L ${cx - r},${arcTop} A ${r},${r} 0 0 1 ${cx + r * 0.7},${arcTop - r * 0.7}`;
    }
    // Locked state
    return `M ${cx - r},${bottom} L ${cx - r},${arcTop} A ${r},${r} 0 0 1 ${cx + r},${arcTop} L ${cx + r},${bottom}`;
  }

  getDataLakePath(node: any): string {
    const x = node.position.x;
    const y = node.position.y;
    const w = node.size.width;
    const h = node.size.height;
    const ry = h * 0.1;
    // Pool-like container with wavy top surface
    return `M ${x},${y + ry} ` +
           `A ${w/2},${ry} 0 0 0 ${x + w},${y + ry} ` +
           `L ${x + w},${y + h - ry} ` +
           `A ${w/2},${ry} 0 0 1 ${x},${y + h - ry} Z ` +
           // Internal waves
           `M ${x + w*0.1},${y + h*0.4} Q ${x + w*0.3},${y + h*0.3} ${x + w*0.5},${y + h*0.4} T ${x + w*0.9},${y + h*0.4} ` +
           `M ${x + w*0.1},${y + h*0.6} Q ${x + w*0.3},${y + h*0.7} ${x + w*0.5},${y + h*0.6} T ${x + w*0.9},${y + h*0.6}`;
  }

  getBrowserPath(node: any): string {
    const x = node.position.x;
    const y = node.position.y;
    const w = node.size.width;
    const h = node.size.height;
    const headH = Math.min(20, h * 0.2);
    return `M ${x},${y+2} Q ${x},${y} ${x+2},${y} L ${x+w-2},${y} Q ${x+w},${y} ${x+w},${y+2} L ${x+w},${y+h-2} Q ${x+w},${y+h} ${x+w-2},${y+h} L ${x+2},${y+h} Q ${x},${y+h} ${x},${y+h-2} Z ` +
           `M ${x},${y+headH} L ${x+w},${y+headH}`;
  }

  getMobilePath(node: any): string {
    const x = node.position.x;
    const y = node.position.y;
    const w = node.size.width;
    const h = node.size.height;
    const r = 8;
    return `M ${x + r},${y} L ${x + w - r},${y} Q ${x + w},${y} ${x + w},${y + r} L ${x + w},${y + h - r} Q ${x + w},${y + h} ${x + w - r},${y + h} L ${x + r},${y + h} Q ${x},${y + h} ${x},${y + h - r} L ${x},${y + r} Q ${x},${y} ${x + r},${y} Z`;
  }

  getMobileScreenPath(node: any): string {
    const x = node.position.x;
    const y = node.position.y;
    const w = node.size.width;
    const h = node.size.height;
    const m = 4; // margin
    const r = 4; // inner radius
    return `M ${x + m + r},${y + m} L ${x + w - m - r},${y + m} Q ${x + w - m},${y + m} ${x + w - m},${y + m + r} L ${x + w - m},${y + h - m - r} Q ${x + w - m},${y + h - m} ${x + w - m - r},${y + h - m} L ${x + m + r},${y + h - m} Q ${x + m},${y + h - m} ${x + m},${y + h - m - r} L ${x + m},${y + m + r} Q ${x + m},${y + m} ${x + m + r},${y + m} Z`;
  }


  // Word wrap text for note shapes
  getWrappedText(text: string, maxWidth: number, fontSize: number = 12): string[] {
    if (!text) return [];

    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    // Approximate character width (this is a rough estimate)
    const avgCharWidth = fontSize * 0.6;
    const maxCharsPerLine = Math.floor(maxWidth / avgCharWidth);

    for (const word of words) {
      const testLine = currentLine ? currentLine + ' ' + word : word;

      if (testLine.length <= maxCharsPerLine) {
        currentLine = testLine;
      } else {
        if (currentLine) {
          lines.push(currentLine);
        }
        currentLine = word;
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    return lines;
  }

  getShapeTypeLabel(shape: string): string {
    switch (shape) {
      case 'circle': return 'Circle';
      case 'numberedCircle': return 'Numbered Circle';
      case 'cylinder': return 'Cylinder';
      case 'diamond': return 'Diamond';
      case 'parallelogram': return 'Para';
      case 'document': return 'Document';
      case 'pill': return 'Pill';
      case 'rounded': return 'Round';
      case 'roundedRectangle': return 'Round';
      case 'hexagon': return 'Hexagon';
      case 'triangle': return 'Triangle';
      case 'trapezoid': return 'Trap';
      case 'stickman': return 'Stickman';
      case 'callout': return 'Callout';
      case 'tape': return 'Tape';
      case 'wall': return 'Wall';
      case 'text': return 'Text';
      case 'note': return 'Note';
      case 'mq': return 'MQ';
      case 'envelope': return 'Envelope';
      case 'cache': return 'Cache';
      case 'tick': return 'Tick';
      case 'cross': return 'Cross';
      case 'star': return 'Star';
      case 'smiley': return 'Smiley';
      case 'donut': return 'Donut';
      case 'lightning': return 'Lightning';
      case 'vault': return 'Vault';
      case 'padlock': return 'Padlock';
      case 'dataLake': return 'Data Lake';
      case 'browser': return 'Browser';
      case 'mobile': return 'Mobile';
      default: return shape.charAt(0).toUpperCase() + shape.slice(1);
    }
  }

  // Get propagated tendrils from inner diagram
  getPropagatedTendrils(node: Node): Tendril[] {
    return this.diagramService.getExposedTendrilsFromInnerDiagram(node.id);
  }

  // Get tendril color based on type and whether it's propagated
  getTendrilColor(tendril: Tendril, isPropagated: boolean): string {
    if (isPropagated) {
      // Darker colors for propagated tendrils
      return tendril.type === 'incoming' ? '#2E7D32' : '#D84315';
    } else {
      // Lighter colors for regular tendrils
      return tendril.type === 'incoming' ? '#81C784' : '#FF8A65';
    }
  }

  // Check if a tendril is propagated from inner diagram
  isPropagatedTendril(nodeId: string, tendrilId: string): boolean {
    const node = this.state.currentDiagram.elements.find(e => e.id === nodeId && isNode(e)) as Node;
    if (!node) return false;
    const propagatedTendrils = this.getPropagatedTendrils(node);
    return propagatedTendrils.some(t => t.id === tendrilId);
  }

  // Get position for propagated tendrils - on the border of the parent node
  getPropagatedTendrilPosition(node: Node, index: number): Position | null {
    const propagatedTendrils = this.getPropagatedTendrils(node);
    if (propagatedTendrils.length === 0 || index >= propagatedTendrils.length) return null;

    const tendril = propagatedTendrils[index];

    // Find the original element in the inner diagram to get its size
    let sourceWidth = 100; // default
    let sourceHeight = 60; // default

    if (node.innerDiagram) {
      const innerDiagram = this.diagramService.diagrams.get(node.innerDiagram.id);
      if (innerDiagram) {
        const prefix = tendril.id.includes('-') ? tendril.id.split('-')[0] : '';
        const sourceElement = innerDiagram.elements.find((e: any) => e.id === prefix);
        if (sourceElement && sourceElement.size) {
          sourceWidth = sourceElement.size.width || 100;
          sourceHeight = sourceElement.size.height || 60;
        }
      }
    }

    // Calculate position as a ratio (0 to 1) along each dimension
    const ratioX = sourceWidth > 0 ? tendril.position.x / sourceWidth : 0.5;
    const ratioY = sourceHeight > 0 ? tendril.position.y / sourceHeight : 0.5;

    // Map to parent node's border
    const parentWidth = node.size?.width || 100;
    const parentHeight = node.size?.height || 60;

    let x: number, y: number;

    // Determine which side of the parent node to place the tendril
    // based on the original position relative to the source element
    if (ratioX <= 0.2) {
      // Left side
      x = 0;
      y = ratioY * parentHeight;
    } else if (ratioX >= 0.8) {
      // Right side
      x = parentWidth;
      y = ratioY * parentHeight;
    } else if (ratioY <= 0.2) {
      // Top side
      y = 0;
      x = ratioX * parentWidth;
    } else if (ratioY >= 0.8) {
      // Bottom side
      y = parentHeight;
      x = ratioX * parentWidth;
    } else {
      // Default: right side (middle right)
      x = parentWidth;
      y = parentHeight / 2;
    }

    return {
      x: node.position.x + x,
      y: node.position.y + y
    };
  }

  // Handle propagated tendril click
  onPropagatedTendrilClick(event: MouseEvent, node: Node, tendril: Tendril): void {
    event.preventDefault();
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
    } else if (event.ctrlKey || event.metaKey || this.isCtrlEdgeMode) {
      // Start edge creation - allow from outgoing propagated tendrils
      if (tendril.type === 'outgoing') {
        this.isCreatingEdge = true;
        this.edgeStartNodeId = node.id;
        this.edgeStartTendrilId = tendril.id;
      }
    } else {
      // Select the tendril
      this.diagramService.selectTendril(node.id, tendril.id);
    }
  }

  // Handle propagated tendril context menu
  onPropagatedTendrilContextMenu(event: MouseEvent, node: Node, tendril: Tendril): void {
    event.preventDefault();
    event.stopPropagation();
    this.diagramService.selectTendril(node.id, tendril.id);

    if (this.propertiesWindow) {
      this.propertiesWindow.open(event.clientX, event.clientY);
    }
  }

  // Get tooltip for tendrils (shows tendril name)
  getTendrilTooltip(elementId: string, tendrilId: string): string {
    // Get the tendril object to show its name
    const element = this.getElementAny(elementId);
    if (!element) return 'Tendril';
    const tendril = this.getTendrilFromElement(element, tendrilId);
    return tendril?.name || 'Tendril';
  }

  // Get tooltip for propagated tendrils
  getPropagatedTendrilTooltip(nodeId: string, tendrilId: string): string {
    // Get the propagated tendril object to show its name
    const node = this.state.currentDiagram.elements.find(e => e.id === nodeId && isNode(e)) as Node;
    if (!node) return 'Propagated Tendril';
    const propagatedTendrils = this.getPropagatedTendrils(node);
    const tendril = propagatedTendrils.find(t => t.id === tendrilId);
    return tendril?.name || 'Propagated Tendril';
  }

  // Handle Ctrl+click edge creation
  private handleCtrlClick(elementId: string): void {
    const element = this.getElementAny(elementId);
    if (!element) return;

    // Don't allow connections to/from line shapes
    if (isNode(element) && (element.shape === 'verticalLine' || element.shape === 'horizontalLine')) {
      return;
    }

    if (!this.ctrlEdgeStartElementId) {
      // First click — just mark the start element and record visual anchor position.
      // We deliberately do NOT create the outgoing tendril here so that the whole
      // edge creation (outgoing + incoming tendril + edge) becomes one atomic undo step.
      const startPos = this.findAvailableTendrilPosition(element, 'outgoing');
      this.tempEdgeStartPosition = {
        x: element.position.x + startPos.x,
        y: element.position.y + startPos.y
      };
      this.ctrlEdgeStartElementId = elementId;
      this.edgeStartNodeId = elementId; // kept for consistency with manual path
      this.isCreatingEdge = true;
    } else if (this.ctrlEdgeStartElementId !== elementId) {
      // Second click — commit everything atomically: outgoing + incoming + edge.
      const startElement = this.getElementAny(this.ctrlEdgeStartElementId);
      const endElement   = this.getElementAny(elementId);

      if (startElement && endElement) {
        const endCenter: Position = {
          x: endElement.position.x + endElement.size.width / 2,
          y: endElement.position.y + endElement.size.height / 2
        };
        const startCenter: Position = {
          x: startElement.position.x + startElement.size.width / 2,
          y: startElement.position.y + startElement.size.height / 2
        };

        const outgoingPos = this.findAvailableTendrilPosition(startElement, 'outgoing', endCenter);
        const incomingPos = this.findAvailableTendrilPosition(endElement,   'incoming', startCenter);

        // Single state change → single undo entry
        this.diagramService.addEdgeWithAutoTendrils(
          this.ctrlEdgeStartElementId,
          elementId,
          outgoingPos,
          incomingPos
        );
      }

      // Reset all edge-creation state
      this.ctrlEdgeStartElementId = undefined;
      this.edgeStartNodeId = undefined;
      this.edgeStartTendrilId = undefined;
      this.tempEdgeStartPosition = undefined;
      this.isCreatingEdge = false;
    }
  }

  // Auto-create an outgoing tendril on an element
  private autoCreateOutgoingTendril(elementId: string): string | null {
    const element = this.getElementAny(elementId);
    if (!element || !('tendrils' in element)) return null;

    // Find an available position on the right border
    const position = this.findAvailableTendrilPosition(element, 'outgoing');

    return this.diagramService.addTendril(elementId, 'outgoing', position);
  }

  // Auto-create an incoming tendril on an element
  private autoCreateIncomingTendril(elementId: string, targetPosition?: Position): string | null {
    const element = this.getElementAny(elementId);
    if (!element || !('tendrils' in element)) return null;

    // Find an available position on the left border
    const position = this.findAvailableTendrilPosition(element, 'incoming', targetPosition);

    return this.diagramService.addTendril(elementId, 'incoming', position);
  }

  // Find an available position for a new tendril that doesn't overlap with existing ones
  private findAvailableTendrilPosition(element: DiagramElement, type: 'incoming' | 'outgoing', targetPosition?: Position): Position {
    const fontSize = 16; // Font size for tendril labels
    const minDistance = fontSize * 2; // Minimum distance between tendrils

    // Get all existing tendrils (any type, on any border)
    const existingTendrils = [
      ...element.tendrils,
      ...(isNode(element) ? this.getPropagatedTendrils(element) : [])
    ];

    // Define the four borders: left, right, top, bottom
    let borders = [
      { x: 0, y: null, isVertical: true, side: 'left' }, // Left border (x=0, y varies)
      { x: element.size.width, y: null, isVertical: true, side: 'right' }, // Right border (x=width, y varies)
      { x: null, y: 0, isVertical: false, side: 'top' }, // Top border (y=0, x varies)
      { x: null, y: element.size.height, isVertical: false, side: 'bottom' } // Bottom border (y=height, x varies)
    ];

    // If target position is provided, prioritize the border facing the target
    if (targetPosition) {
      const center = {
        x: element.position.x + element.size.width / 2,
        y: element.position.y + element.size.height / 2
      };

      const dx = targetPosition.x - center.x;
      const dy = targetPosition.y - center.y;

      // Determine primary and secondary directions
      const isHorizontal = Math.abs(dx) > Math.abs(dy);

      let preferredSides: string[] = [];

      if (isHorizontal) {
        if (dx > 0) { // Target is to the right
          preferredSides = ['right', 'top', 'bottom', 'left'];
        } else { // Target is to the left
          preferredSides = ['left', 'top', 'bottom', 'right'];
        }
      } else {
        if (dy > 0) { // Target is below
          preferredSides = ['bottom', 'left', 'right', 'top'];
        } else { // Target is above
          preferredSides = ['top', 'left', 'right', 'bottom'];
        }
      }

      // Sort borders based on preference
      borders.sort((a, b) => {
        return preferredSides.indexOf(a.side) - preferredSides.indexOf(b.side);
      });
    }

    // Try each border in order
    for (const border of borders) {
      if (border.isVertical) {
        // Vertical border (left or right) - vary y, fixed x
        for (let y = 15; y <= element.size.height - 15; y += minDistance) {
          const position = { x: border.x!, y };

          // Check if this position conflicts with any existing tendril
          const hasConflict = existingTendrils.some(tendril => {
            const distance = Math.sqrt(
              Math.pow(tendril.position.x - position.x, 2) +
              Math.pow(tendril.position.y - position.y, 2)
            );
            return distance < minDistance;
          });

          if (!hasConflict) {
            return position;
          }
        }
      } else {
        // Horizontal border (top or bottom) - vary x, fixed y
        for (let x = 15; x <= element.size.width - 15; x += minDistance) {
          const position = { x, y: border.y! };

          // Check if this position conflicts with any existing tendril
          const hasConflict = existingTendrils.some(tendril => {
            const distance = Math.sqrt(
              Math.pow(tendril.position.x - position.x, 2) +
              Math.pow(tendril.position.y - position.y, 2)
            );
            return distance < minDistance;
          });

          if (!hasConflict) {
            return position;
          }
        }
      }
    }

    // If no position found on any border, use a fallback (center of right border)
    return { x: element.size.width, y: element.size.height / 2 };
  }

  // Template helper methods
  isSvgImage(element: DiagramElement): boolean {
    return isSvgImage(element);
  }

  isNode(element: DiagramElement): boolean {
    return isNode(element);
  }

  getNodeTransform(element: DiagramElement): string | null {
    if (!isNode(element)) return null;
    if (!element.flipHorizontal && !element.flipVertical) return null;

    const x = element.position.x;
    const y = element.position.y;
    const w = element.size.width;
    const h = element.size.height;

    let tx = 0;
    let ty = 0;
    let sx = 1;
    let sy = 1;

    if (element.flipHorizontal) {
      tx = x * 2 + w;
      sx = -1;
    }

    if (element.flipVertical) {
      ty = y * 2 + h;
      sy = -1;
    }

    return `translate(${tx} ${ty}) scale(${sx} ${sy})`;
  }

  // Save diagram method for keyboard shortcut
  saveDiagram(): void {
    const json = this.diagramService.saveDiagram();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'diagram.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  // Navigation methods
  canGoBack(): boolean {
    return this.state.diagramStack.length > 0;
  }

  goBack(): void {
    this.diagramService.goBack();
  }

  deleteCurrentDiagram(): void {
    if (confirm('Are you sure you want to delete this nested diagram? This action cannot be undone.')) {
      this.diagramService.deleteInnerDiagram();
    }
  }

  // Tendril drag handling
  onTendrilDragStarted(event: any, element: DiagramElement, tendril: Tendril): void {
    // Allow default drag behavior
  }

  onTendrilDragMoved(event: any, element: DiagramElement, tendril: Tendril): void {
    // Get the current drag position
    const rect = this.canvas.nativeElement.getBoundingClientRect();

    // Calculate the absolute position of the tendril
    const currentX = event.pointerPosition.x - rect.left;
    const currentY = event.pointerPosition.y - rect.top;

    // Calculate relative position to the element
    const relativeX = currentX - element.position.x;
    const relativeY = currentY - element.position.y;

    // Constrain to border: find the closest point on the element's border
    const constrainedPosition = this.constrainToBorder(relativeX, relativeY, element.size);

    // Update the tendril position in the data model during drag for live edge updates
    this.diagramService.updateTendril(element.id, tendril.id, {
      position: constrainedPosition
    });

    // Force re-render of edge paths during drag
    this.forceUpdate++;
  }

  onTendrilDragEnded(event: any, element: DiagramElement, tendril: Tendril): void {
    // Get the final position and update the tendril
    const rect = this.canvas.nativeElement.getBoundingClientRect();
    const finalX = event.pointerPosition.x - rect.left;
    const finalY = event.pointerPosition.y - rect.top;

    // Calculate relative position to the element
    const relativeX = finalX - element.position.x;
    const relativeY = finalY - element.position.y;

    // Constrain to border
    const constrainedPosition = this.constrainToBorder(relativeX, relativeY, element.size);

    // Update the tendril position in the service
    this.diagramService.updateTendril(element.id, tendril.id, {
      position: constrainedPosition
    });

    // Force re-render of edge paths by incrementing forceUpdate
    this.forceUpdate++;
  }

  // Constrain a point to the border of a rectangular element
  private constrainToBorder(x: number, y: number, size: Size): Position {
    const { width, height } = size;

    // Calculate absolute distances to each border regardless of inside/outside
    const distToLeft = Math.abs(x);
    const distToRight = Math.abs(width - x);
    const distToTop = Math.abs(y);
    const distToBottom = Math.abs(height - y);

    // Find the minimum distance
    const minDist = Math.min(distToLeft, distToRight, distToTop, distToBottom);

    // Snap to the closest border
    if (minDist === distToLeft) {
      return { x: 0, y: Math.max(10, Math.min(height - 10, y)) }; // Left border
    } else if (minDist === distToRight) {
      return { x: width, y: Math.max(10, Math.min(height - 10, y)) }; // Right border
    } else if (minDist === distToTop) {
      return { x: Math.max(10, Math.min(width - 10, x)), y: 0 }; // Top border
    } else {
      return { x: width, y: height }; // Should be unreachable given minDist logic
    }
  }

  // Live Centroid and Intersection Helpers
  private getLiveCentroid(element: any): Position {
    let x = element.position.x;
    let y = element.position.y;
    if (this.movingElementIds.has(element.id)) {
      x += this.draggingDelta.x;
      y += this.draggingDelta.y;
    }
    return {
      x: x + element.size.width / 2,
      y: y + element.size.height / 2
    };
  }

  private getLiveGlobalIntersection(element: any, target: Position): Position {
    const centroid = this.getLiveCentroid(element);
    const w = element.size.width;
    const h = element.size.height;

    const dx = target.x - centroid.x;
    const dy = target.y - centroid.y;

    if (dx === 0 && dy === 0) return { x: centroid.x + w / 2, y: centroid.y };

    // Circle intersection
    if (isNode(element) && element.shape === 'circle') {
      const radius = Math.min(w, h) / 2;
      const dist = Math.sqrt(dx * dx + dy * dy);
      return {
        x: centroid.x + (dx / dist) * radius,
        y: centroid.y + (dy / dist) * radius
      };
    }

    // Default: Box intersection
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    let scale = 1;
    if (w * absDy > h * absDx) {
      scale = (h / 2) / (absDy || 1);
    } else {
      scale = (w / 2) / (absDx || 1);
    }

    return {
      x: centroid.x + dx * scale,
      y: centroid.y + dy * scale
    };
  }
}
