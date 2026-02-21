import { Component, ElementRef, HostListener, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DiagramService } from '../../services/diagram.service';
import { Node, Edge, Tendril, BoundingBox, isNode, isBoundingBox } from '../../models/diagram.model';

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
          state.selectedBoundingBoxIds.length === 0) {
        this.close();
      }
    });
  }

  // Called from canvas on right-click
  open(x: number, y: number) {
    this.x = x;
    this.y = y;
    this.isVisible = true;
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

  get type(): 'node' | 'tendril' | 'edge' | 'boundingBox' | 'svg' | null {
    if (this.selectedTendril) return 'tendril';
    if (this.selectedEdge) return 'edge';

    if (this.diagramService.currentState.selectedBoundingBoxId) return 'boundingBox';

    const element = this.selectedElement;
    if (element) {
      if (isNode(element)) return 'node';
      return 'svg';
    }
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

  // --- Common Properties: Label ---

  getLabel(): string {
    return this.selectedElement?.label || '';
  }

  updateLabel(event: Event) {
    const value = (event.target as HTMLInputElement | HTMLTextAreaElement).value;
    if (this.selectedElement) {
      this.diagramService.updateElementProperty(this.selectedElement.id, 'label', value);
    }
  }

  // --- Node / Edge Shared Properties: Stroke, Dotted, Font ---

  getStrokeColor(): string {
    const element = this.selectedElement;
    if (element) return element.borderColor;
    return this.selectedEdge?.attributes['borderColor'] || '#000000';
  }

  updateStrokeColor(event: Event) {
    const color = (event.target as HTMLInputElement).value;
    const element = this.selectedElement;
    if (element) {
      this.diagramService.updateElementProperty(element.id, 'borderColor', color);
    } else if (this.selectedEdge) {
      this.diagramService.updateEdgeProperty(this.selectedEdge.id, 'borderColor', color);
    }
  }

  getIsDotted(): boolean {
    const element = this.selectedElement;
    if (element && isNode(element)) return element.dotted;
    return this.selectedEdge?.attributes['dotted'] || false;
  }

  toggleDotted() {
    const newValue = !this.getIsDotted();
    if (this.selectedElement && isNode(this.selectedElement)) {
      this.diagramService.updateElementProperty(this.selectedElement.id, 'dotted', newValue);
    } else if (this.selectedEdge) {
      this.diagramService.updateEdgeProperty(this.selectedEdge.id, 'dotted', newValue);
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
      // Default to true if somehow undefined
      return this.selectedTendril?.exposed !== false;
  }

  toggleExposed() {
      if (this.selectedTendril) {
          const newValue = !this.getIsExposed();
          this.diagramService.updateTendrilExposed(this.selectedTendril.id, newValue);
      }
  }
}
