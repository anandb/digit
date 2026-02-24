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
  windowWidth = 340; // Default width
  windowHeight = 600; // Default height

  // Window state
  notesExpanded = false;

  // Resize state
  private isResizing = false;
  private resizeStartX = 0;
  private resizeStartY = 0;
  private resizeStartWidth = 0;
  private resizeStartHeight = 0;

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
      } else {
        this.syncTagsIfNeeded();
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
    // Prevent closing if we are in the middle of a resize
    if (this.isResizing) return;

    // Close if clicking outside the properties window AND not a right-click
    if (this.isVisible && event.button !== 2) { // 2 is right click
      const clickedInside = this.elementRef.nativeElement.contains(event.target);
      if (!clickedInside) {
        this.close();
      }
    }
  }

  onResizeStart(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isResizing = true;
    this.resizeStartX = event.clientX;
    this.resizeStartY = event.clientY;

    const element = this.elementRef.nativeElement.querySelector('.properties-window');
    if (element) {
      const rect = element.getBoundingClientRect();
      this.resizeStartWidth = rect.width;
      this.resizeStartHeight = rect.height;
    }
  }

  @HostListener('document:mousemove', ['$event'])
  onResizeMove(event: MouseEvent) {
    if (!this.isResizing) return;

    const dx = event.clientX - this.resizeStartX;
    const dy = event.clientY - this.resizeStartY;

    // A fixed minimum dimension strategy works best here.
    const minWidth = 340;
    const minHeight = 600;

    // Dynamic minimum dimensions
    this.windowWidth = Math.max(minWidth, this.resizeStartWidth + dx);
    this.windowHeight = Math.max(minHeight, this.resizeStartHeight + dy);
  }

  @HostListener('document:mouseup', ['$event'])
  onResizeEnd(event: MouseEvent) {
    if (this.isResizing) {
       this.isResizing = false;
       // We stop propagation so that a document click doesn't immediately close the window
       // when the user finishes dragging the handle (which could occasionally happen outside the nativeElement)
       // although technically the resize handle is inside the element. This just plays it safe.
    }
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscapeKey(event: Event) {
    if (this.isVisible) {
      this.close();
      this.diagramService.clearSelection();
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

  get isPadlockShape(): boolean {
    const element = this.selectedElement;
    return !!(element && isNode(element) && element.shape === 'padlock');
  }

  // --- Common Properties: Notes ---

  getNotes(): string {
    return this.selectedElement?.notes ||
           this.selectedTendril?.notes ||
           this.selectedEdge?.notes || '';
  }

  toggleNotes() {
    this.notesExpanded = !this.notesExpanded;
    if (this.notesExpanded) this.autoExpandHeight();
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

  // --- Common Properties: Tags ---

  tagsExpanded = false;
  localTags: { key: string, value: string }[] = [];
  private lastElementId: string | null = null;
  private lastAttributesRef: any = null;

  toggleTags() {
    this.tagsExpanded = !this.tagsExpanded;
    if (this.tagsExpanded) this.autoExpandHeight();
  }

  private autoExpandHeight() {
    setTimeout(() => {
      const element = this.elementRef.nativeElement.querySelector('.properties-window');
      const contentElement = this.elementRef.nativeElement.querySelector('.properties-content');
      if (element && contentElement) {
        const headerEl = element.querySelector('.properties-header');
        const headerHeight = headerEl ? headerEl.getBoundingClientRect().height : 0;
        const neededHeight = headerHeight + contentElement.scrollHeight + 20;

        // Only expand the window, never shrink it automatically
        if (this.windowHeight < neededHeight) {
          this.windowHeight = neededHeight;

          // Adjust Y if the new height pushes it off the bottom of the screen
          const viewportHeight = window.innerHeight;
          if (this.y + this.windowHeight > viewportHeight) {
             // Move the window up, but don't let it go past the top edge (10px padding)
             this.y = Math.max(10, viewportHeight - this.windowHeight - 10);
          }
        }
      }
    });
  }

  private syncTagsIfNeeded() {
    const element = this.selectedElement || this.selectedTendril || this.selectedEdge || this.selectedConnector;
    const elementId = element?.id || null;
    const attributes = (element as any)?.attributes || {};

    const oldElementId = this.lastElementId;
    if (elementId !== this.lastElementId || attributes !== this.lastAttributesRef) {
      this.lastElementId = elementId;
      this.lastAttributesRef = attributes;

      const localAttributes: {[key:string]: string} = {};
      this.localTags.forEach(t => {
        const k = t.key.trim();
        if (k) localAttributes[k] = t.value;
      });

      const modelAttributes: {[key:string]: string} = {};
      Object.keys(attributes).forEach(k => {
        if (!['fontFamily'].includes(k)) {
           modelAttributes[k] = attributes[k];
        }
      });

      let diff = false;
      const localKeys = Object.keys(localAttributes);
      const modelKeys = Object.keys(modelAttributes);
      if (localKeys.length !== modelKeys.length) diff = true;
      else {
        for (const k of localKeys) {
          if (localAttributes[k] !== modelAttributes[k]) {
            diff = true; break;
          }
        }
      }

      if (diff || this.localTags.length === 0 || elementId !== oldElementId) {
        const newTags = modelKeys.map(k => ({ key: k, value: modelAttributes[k] }));
        newTags.push({ key: '', value: '' });
        this.localTags = newTags;
      }
    }
  }

  updateTag(index: number, field: 'key' | 'value', event: Event) {
    const newValue = (event.target as HTMLInputElement).value;

    this.localTags[index][field] = newValue;

    // Auto add a new row if we are typing in the last empty row, but only when typing in the value field
    if (field === 'value' && index === this.localTags.length - 1 && this.localTags[index].value) {
      this.localTags.push({ key: '', value: '' });
    }

    this.saveTagsToModel(this.localTags);
  }

  onTagBlur(index: number, event: Event) {
    if (index < this.localTags.length - 1 && !this.localTags[index].key.trim() && !this.localTags[index].value.trim()) {
      this.localTags.splice(index, 1);
      this.saveTagsToModel(this.localTags);
    }
  }

  trackByIndex(index: number, obj: any): any {
    return index;
  }

  private saveTagsToModel(tags: { key: string, value: string }[]) {
     const newAttributes: { [key: string]: string } = {};
     tags.forEach(tag => {
       const key = tag.key.trim();
       if (key) {
         newAttributes[key] = tag.value;
       }
     });

     // Preserve specific non-tag attributes if they exist
     const currentAttributes = this.selectedElement?.attributes ||
                               this.selectedTendril?.attributes ||
                               this.selectedEdge?.attributes ||
                               (this.selectedConnector as any)?.attributes || {};

     if (currentAttributes['fontFamily']) {
        newAttributes['fontFamily'] = currentAttributes['fontFamily'];
     }

     if (this.selectedElement) {
       this.diagramService.updateElementProperty(this.selectedElement.id, 'attributes', newAttributes);
     } else if (this.selectedTendril) {
       const tendrilData = this.getTendrilFromState();
       if (tendrilData) {
         this.diagramService.updateTendril(tendrilData.nodeId, tendrilData.tendril.id, { attributes: newAttributes });
       }
     } else if (this.selectedEdge) {
       this.diagramService.updateEdge(this.selectedEdge.id, { attributes: newAttributes });
     } else if (this.selectedConnector) {
       this.diagramService.updateConnector(this.selectedConnector.id, { attributes: newAttributes });
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

  getIsRounded(): boolean {
    const element = this.selectedElement;
    if (!element) return false;
    if (isBoundingBox(element)) return element.rounded;
    if (isNode(element) && element.shape === 'rectangle') return !!element.rounded;
    return false;
  }

  toggleRounded() {
    const element = this.selectedElement;
    if (!element) return;
    if (isBoundingBox(element)) {
      this.diagramService.updateBoundingBox(element.id, { rounded: !element.rounded });
    } else if (isNode(element) && element.shape === 'rectangle') {
      this.diagramService.updateElementProperty(element.id, 'rounded', !element.rounded);
    }
  }

  // --- Mirror Property ---

  getSupportsMirror(): boolean {
    const element = this.selectedElement;
    if (!element || !isNode(element)) return false;
    return ['rectangle', 'roundedRectangle', 'pill', 'circle', 'mq', 'envelope'].includes(element.shape);
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

  // --- Locked Property (Padlock) ---

  getIsLocked(): boolean {
    const element = this.selectedElement;
    if (element && isNode(element)) {
      // Default to locked (true) if not set
      return element.locked !== false;
    }
    return false;
  }

  toggleLocked() {
    const element = this.selectedElement;
    if (element && isNode(element)) {
      const newValue = !this.getIsLocked();
      this.diagramService.updateElementProperty(element.id, 'locked', newValue);
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
