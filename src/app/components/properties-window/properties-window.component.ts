import { Component, ElementRef, HostListener, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DiagramService } from '../../services/diagram.service';
import { Node, Edge, Tendril, BoundingBox, Connector, isNode, isBoundingBox } from '../../models/diagram.model';

@Component({
  selector: 'app-properties-window',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './properties-window.component.html',
  styleUrls: ['./properties-window.component.sass']
})
export class PropertiesWindowComponent implements OnInit {
  isVisible = false;
  x = 0;
  y = 0;

  // Window state
  notesExpanded = false;

  constructor(
    public diagramService: DiagramService,
    private elementRef: ElementRef
  ) {}

  ngOnInit() {
    // Subscribe to selection changes to show/hide the window
    this.diagramService.state$.subscribe(state => {
      // Basic visibility logic. Will be augmented by context menu event
      // If nothing is selected, ensure we close
      if (state.selectedNodeIds.length === 0 &&
          !state.selectedTendrilId &&
          state.selectedEdgeIds.length === 0 &&
          state.selectedBoundingBoxIds.length === 0 &&
          (state.selectedConnectorIds || []).length === 0) {
        this.close();
      }
    });
  }

  // Called from canvas on right-click
  open(x: number, y: number) {
    this.isVisible = true;
    this.x = x;
    this.y = y;

    // Use setTimeout to allow DOM to render so we can measure height
    setTimeout(() => {
      const element = this.elementRef.nativeElement.querySelector('.properties-window');
      if (element) {
        const rect = element.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        const viewportWidth = window.innerWidth;

        // Adjust Y if it goes off bottom
        if (this.y + rect.height > viewportHeight) {
          this.y = Math.max(10, viewportHeight - rect.height - 20);
        }

        // Adjust X if it goes off right
        if (this.x + rect.width > viewportWidth) {
          this.x = Math.max(10, viewportWidth - rect.width - 20);
        }
      }
    });
  }

  close() {
    this.isVisible = false;
    this.notesExpanded = false; // Reset accordion state
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    // Close if clicking outside the properties window AND not a right-click
    if (this.isVisible && event.button !== 2) { // 2 is right click
      const clickedInside = this.elementRef.nativeElement.contains(event.target);
      if (!clickedInside) {
        this.close();
      }
    }
  }

  // --- Getters for Context ---

  get selectedNodeId(): string | undefined {
    return this.diagramService.currentState.selectedNodeIds[0];
  }

  get selectedEdgeId(): string | undefined {
    return this.diagramService.currentState.selectedEdgeIds[0];
  }

  get selectedConnectorId(): string | undefined {
    return (this.diagramService.currentState.selectedConnectorIds || [])[0];
  }

  get selectedConnector(): Connector | null {
    const state = this.diagramService.currentState;
    const connectorId = this.selectedConnectorId;
    if (!connectorId) return null;
    return state.currentDiagram.connectors.find(c => c.id === connectorId) || null;
  }

  get selectedBoundingBox(): BoundingBox | null {
    const state = this.diagramService.currentState;
    if (!state.selectedBoundingBoxId) return null;
    return this.diagramService.currentState.currentDiagram.boundingBoxes.find(b => b.id === state.selectedBoundingBoxId) || null;
  }

  get selectedElement(): Node | BoundingBox | null {
    const state = this.diagramService.currentState;

    // Priority should match the 'type' getter
    if (state.selectedBoundingBoxId) {
      return this.selectedBoundingBox;
    }

    if (state.selectedNodeId) {
      return this.diagramService.getNode(state.selectedNodeId) || null;
    }

    return null;
  }

  get selectedTendril(): Tendril | null {
    if (!this.diagramService.currentState.selectedTendrilId) return null;
    return this.diagramService.getTendrilById(this.diagramService.currentState.selectedTendrilId) || null;
  }

  get selectedEdge(): Edge | null {
    if (!this.selectedEdgeId) return null;
    return this.diagramService.getEdge(this.selectedEdgeId) || null;
  }

  get type(): 'node' | 'tendril' | 'edge' | 'boundingBox' | 'svg' | 'connector' | null {
    const state = this.diagramService.currentState;
    if (state.selectedTendrilId) return 'tendril';
    if (state.selectedNodeIds.length > 0) return 'node';
    if (state.selectedEdgeIds.length > 0) return 'edge';
    if (state.selectedBoundingBoxIds.length > 0) return 'boundingBox';
    if (state.selectedSvgImageIds.length > 0) return 'svg';
    if ((state.selectedConnectorIds || []).length > 0) return 'connector';
    return null;
  }

  get isNoteShape(): boolean {
    const element = this.selectedElement;
    return !!(element && isNode(element) && element.shape === 'note');
  }

  get isTextShape(): boolean {
    const element = this.selectedElement;
    return !!(element && isNode(element) && element.shape === 'text');
  }

  // --- Common Properties: Notes ---

  getNotes(): string {
    return this.selectedElement?.notes ||
           this.selectedTendril?.notes ||
           this.selectedEdge?.notes || '';
  }

  updateNotes(event: Event) {
    const value = (event.target as HTMLTextAreaElement).value;
    if (this.selectedElement) {
      this.diagramService.updateElementProperty(this.selectedElement.id, 'notes', value);
    } else if (this.selectedTendril) {
      this.diagramService.updateTendrilNotes(this.selectedTendril.id, value);
    } else if (this.selectedEdge) {
      this.diagramService.updateEdgeProperty(this.selectedEdge.id, 'notes', value);
    }
  }

  // --- Common Properties: Name ---

  private getTendrilFromState(): { tendril: import('../../models/diagram.model').Tendril, nodeId: string } | null {
    const tendrilId = this.diagramService.currentState.selectedTendrilId;
    const nodeId = this.diagramService.currentState.selectedNodeIds[0];
    if (!tendrilId || !nodeId) return null;

    const tendril = this.diagramService.getTendrilById(tendrilId);
    if (tendril) return { tendril, nodeId };
    return null;
  }

  isPropagatedTendril(): boolean {
    const tendrilId = this.diagramService.currentState.selectedTendrilId;
    if (!tendrilId) return false;
    return tendrilId.includes('-');
  }

  getName(): string {
    const tendrilData = this.getTendrilFromState();
    if (tendrilData) return tendrilData.tendril.name || '';
    if (this.selectedElement) return this.selectedElement.label || '';
    if (this.selectedEdge) return this.selectedEdge.name || '';
    if (this.selectedConnector) return this.selectedConnector.name || '';
    return '';
  }

  updateName(event: Event) {
    if (this.isPropagatedTendril()) return; // Cannot edit name of propagated tendrils
    const value = (event.target as HTMLInputElement).value;
    const tendrilData = this.getTendrilFromState();
    if (tendrilData) {
      this.diagramService.updateTendril(tendrilData.nodeId, tendrilData.tendril.id, { name: value });
    } else if (this.selectedElement) {
      this.diagramService.updateElementProperty(this.selectedElement.id, 'label', value);
    } else if (this.selectedEdge) {
      this.diagramService.updateEdgeProperty(this.selectedEdge.id, 'name', value);
    } else if (this.selectedConnector) {
      this.diagramService.updateConnector(this.selectedConnector.id, { name: value });
    }
  }

  // --- Common Properties: Label ---

  getLabel(): string {
    if (this.selectedElement) return this.selectedElement.label;
    if (this.selectedEdge) return this.selectedEdge.name || '';
    if (this.selectedConnector) return this.selectedConnector.name || '';
    return '';
  }

  updateLabel(event: Event) {
    const value = (event.target as HTMLInputElement | HTMLTextAreaElement).value;
    if (this.selectedElement) {
      this.diagramService.updateElementProperty(this.selectedElement.id, 'label', value);
    } else if (this.selectedEdge) {
      this.diagramService.updateEdgeProperty(this.selectedEdge.id, 'name', value);
    } else if (this.selectedConnector) {
      this.diagramService.updateConnector(this.selectedConnector.id, { name: value });
    }
  }

  // --- Node / Edge Shared Properties: Stroke, Dotted, Font ---

  getStrokeColor(): string {
    const element = this.selectedElement;
    if (element) return element.borderColor;
    if (this.selectedEdge) return this.selectedEdge.borderColor || '#000000';
    return this.selectedConnector?.borderColor || '#000000';
  }

  updateStrokeColor(event: Event) {
    const color = (event.target as HTMLInputElement).value;
    const element = this.selectedElement;
    if (element) {
      this.diagramService.updateElementProperty(element.id, 'borderColor', color);
    } else if (this.selectedEdge) {
      this.diagramService.updateEdgeProperty(this.selectedEdge.id, 'borderColor', color);
    } else if (this.selectedConnector) {
      this.diagramService.updateConnector(this.selectedConnector.id, { borderColor: color });
    }
  }

  getStrokeWidth(): number {
    const element = this.selectedElement;
    if (element && 'strokeWidth' in element) return element.strokeWidth || 1;
    if (this.selectedEdge) return (this.selectedEdge as any).strokeWidth || 1;
    return this.selectedConnector?.strokeWidth || 1;
  }

  updateStrokeWidth(event: Event) {
    const width = parseInt((event.target as HTMLSelectElement).value, 10);
    const element = this.selectedElement;
    if (element) {
      this.diagramService.updateElementProperty(element.id, 'strokeWidth', width);
    } else if (this.selectedEdge) {
      this.diagramService.updateEdgeProperty(this.selectedEdge.id, 'strokeWidth', width);
    } else if (this.selectedConnector) {
      this.diagramService.updateConnector(this.selectedConnector.id, { strokeWidth: width });
    }
  }

  getIsDotted(): boolean {
    const element = this.selectedElement;
    if (element && isNode(element)) return element.dotted;
    if (this.selectedEdge) return this.selectedEdge.dotted || false;
    return this.selectedConnector?.dotted || false;
  }

  toggleDotted() {
    const newValue = !this.getIsDotted();
    if (this.selectedElement && isNode(this.selectedElement)) {
      this.diagramService.updateElementProperty(this.selectedElement.id, 'dotted', newValue);
    } else if (this.selectedEdge) {
      this.diagramService.updateEdgeProperty(this.selectedEdge.id, 'dotted', newValue);
    } else if (this.selectedConnector) {
      this.diagramService.updateConnector(this.selectedConnector.id, { dotted: newValue });
    }
  }

  getIsBoxRounded(): boolean {
    const element = this.selectedElement;
    if (element && isBoundingBox(element)) return element.rounded;
    return false;
  }

  toggleBoxRounded() {
    const element = this.selectedElement;
    if (element && isBoundingBox(element)) {
      this.diagramService.updateBoundingBox(element.id, { rounded: !element.rounded });
    }
  }

  // --- Mirror Property ---

  getSupportsMirror(): boolean {
    const element = this.selectedElement;
    if (!element || !isNode(element)) return false;
    return ['rectangle', 'roundedRectangle', 'pill', 'circle'].includes(element.shape);
  }

  getIsMirrored(): boolean {
    const element = this.selectedElement;
    if (element && isNode(element)) return !!element.mirror;
    return false;
  }

  toggleMirrored() {
    const newValue = !this.getIsMirrored();
    if (this.selectedElement && isNode(this.selectedElement)) {
      this.diagramService.updateElementProperty(this.selectedElement.id, 'mirror', newValue);
    }
  }

  getFontFamily(): string {
    return this.selectedElement?.fontFamily ||
           this.selectedEdge?.attributes['fontFamily'] || 'Arial';
  }

  updateFontFamily(event: Event) {
    const font = (event.target as HTMLSelectElement).value;
    const element = this.selectedElement;
    if (element) {
      this.diagramService.updateElementProperty(element.id, 'fontFamily', font);
    } else if (this.selectedEdge) {
      this.diagramService.updateEdgeProperty(this.selectedEdge.id, 'fontFamily', font);
    }
  }

  getFontSize(): number {
    return (this.selectedElement as any)?.fontSize ||
           (this.selectedEdge as any)?.fontSize || 14;
  }

  updateFontSize(event: Event) {
    const size = parseInt((event.target as HTMLInputElement).value, 10);
    const element = this.selectedElement;
    if (element) {
      this.diagramService.updateElementProperty(element.id, 'fontSize', size);
    } else if (this.selectedEdge) {
      this.diagramService.updateEdgeProperty(this.selectedEdge.id, 'fontSize', size);
    }
  }

  getFontWeight(): string {
    return (this.selectedElement as any)?.fontWeight ||
           (this.selectedEdge as any)?.fontWeight || 'normal';
  }

  toggleFontWeight() {
    const current = this.getFontWeight();
    const newValue = current === 'bold' ? 'normal' : 'bold';
    const element = this.selectedElement;
    if (element) {
      this.diagramService.updateElementProperty(element.id, 'fontWeight', newValue);
    } else if (this.selectedEdge) {
      this.diagramService.updateEdgeProperty(this.selectedEdge.id, 'fontWeight', newValue);
    }
  }

  getFontStyle(): string {
    return (this.selectedElement as any)?.fontStyle ||
           (this.selectedEdge as any)?.fontStyle || 'normal';
  }

  toggleFontStyle() {
    const current = this.getFontStyle();
    const newValue = current === 'italic' ? 'normal' : 'italic';
    const element = this.selectedElement;
    if (element) {
      this.diagramService.updateElementProperty(element.id, 'fontStyle', newValue);
    } else if (this.selectedEdge) {
      this.diagramService.updateEdgeProperty(this.selectedEdge.id, 'fontStyle', newValue);
    } else if (this.selectedConnector) {
      this.diagramService.updateConnector(this.selectedConnector.id, { fontStyle: newValue });
    }
  }

  // --- Connector Arrows ---

  getStartArrow(): boolean {
    return this.selectedConnector?.startArrow || false;
  }

  toggleStartArrow() {
    if (this.selectedConnector) {
      const newValue = !this.getStartArrow();
      this.diagramService.updateConnector(this.selectedConnector.id, { startArrow: newValue });
    }
  }

  getEndArrow(): boolean {
    return this.selectedConnector?.endArrow || false;
  }

  toggleEndArrow() {
    if (this.selectedConnector) {
      const newValue = !this.getEndArrow();
      this.diagramService.updateConnector(this.selectedConnector.id, { endArrow: newValue });
    }
  }

  // --- Node Only Properties: Fill Color ---

  getFillColor(): string {
    return this.selectedElement?.fillColor || '#ffffff';
  }

  updateFillColor(event: Event) {
    const color = (event.target as HTMLInputElement).value;
    if (this.selectedElement) {
      this.diagramService.updateElementProperty(this.selectedElement.id, 'fillColor', color);
    }
  }

  // --- Tendril Only Properties: Exposed/Internal ---

  getIsExposed(): boolean {
    const tendrilData = this.getTendrilFromState();
    return tendrilData ? this.diagramService.isTendrilExposedInDiagram(tendrilData.tendril, this.diagramService.currentState.currentDiagram.id) : false;
  }

  toggleExposed() {
    const tendrilData = this.getTendrilFromState();
    if (tendrilData) {
      const newValue = !this.getIsExposed();
      const tendril = { ...tendrilData.tendril };
      if (!tendril.exposedOverrides) {
        tendril.exposedOverrides = {};
      }
      tendril.exposedOverrides[this.diagramService.currentState.currentDiagram.id] = newValue;
      this.diagramService.updateTendril(tendrilData.nodeId, tendrilData.tendril.id, tendril);
    }
  }
}
