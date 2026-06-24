import { Component, ElementRef, HostListener, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DiagramService } from '../../services/diagram.service';
import { Node, BoundingBox, Connector, SvgImage, isNode, isBoundingBox, isSvgImage } from '../../models/diagram.model';

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
          state.selectedBoundingBoxIds.length === 0 &&
          state.selectedSvgImageIds.length === 0 &&
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

  get selectedElement(): Node | BoundingBox | SvgImage | null {
    const state = this.diagramService.currentState;

    // Priority should match the 'type' getter
    if (state.selectedBoundingBoxId) {
      return this.selectedBoundingBox;
    }

    if (state.selectedNodeId) {
      return this.diagramService.getNode(state.selectedNodeId) || null;
    }

    if (state.selectedSvgImageIds.length > 0) {
      const svgId = state.selectedSvgImageIds[0];
      return state.currentDiagram.elements.find(e => isSvgImage(e) && e.id === svgId) as SvgImage || null;
    }

    return null;
  }

  get type(): 'node' | 'boundingBox' | 'svg' | 'connector' | null {
    const state = this.diagramService.currentState;
    if (state.selectedNodeIds.length > 0) return 'node';
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

  get isCrcCardShape(): boolean {
    const element = this.selectedElement;
    return !!(element && isNode(element) && element.shape === 'crcCard');
  }

  get isThreatTableShape(): boolean {
    const element = this.selectedElement;
    return !!(element && isNode(element) && element.shape === 'threatTable');
  }

  get isWallShape(): boolean {
    const element = this.selectedElement;
    return !!(element && isNode(element) && element.shape === 'wall');
  }

  get isRectangleShape(): boolean {
    const element = this.selectedElement;
    return !!(element && isNode(element) && element.shape === 'rectangle');
  }

  get isRoundedRectangleShape(): boolean {
    const element = this.selectedElement;
    return !!(element && isNode(element) && element.shape === 'roundedRectangle');
  }

  // --- Common Properties: Notes ---

  getNotes(): string {
    return this.selectedElement?.notes || '';
  }

  toggleNotes() {
    this.notesExpanded = !this.notesExpanded;
    if (this.notesExpanded) this.autoExpandHeight();
  }

  updateNotes(event: Event) {
    const value = (event.target as HTMLTextAreaElement).value;
    if (this.selectedElement) {
      this.diagramService.updateElementProperty(this.selectedElement.id, 'notes', value);
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
    const element = this.selectedElement || this.selectedConnector;
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
                                (this.selectedConnector as any)?.attributes || {};

      if (currentAttributes['fontFamily']) {
         newAttributes['fontFamily'] = currentAttributes['fontFamily'];
      }

      if (this.selectedElement) {
        this.diagramService.updateElementProperty(this.selectedElement.id, 'attributes', newAttributes);
      } else if (this.selectedConnector) {
        this.diagramService.updateConnector(this.selectedConnector.id, { attributes: newAttributes });
      }
  }

  // --- Common Properties: Name ---

  getName(): string {
    if (this.selectedElement) return this.selectedElement.label || '';
    if (this.selectedConnector) return this.selectedConnector.name || '';
    return '';
  }

  updateName(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    if (this.selectedElement) {
      this.diagramService.updateElementProperty(this.selectedElement.id, 'label', value);
    } else if (this.selectedConnector) {
      this.diagramService.updateConnector(this.selectedConnector.id, { name: value });
    }
  }

  // --- Common Properties: Label ---

  getLabel(): string {
    if (this.selectedElement) return this.selectedElement.label;
    if (this.selectedConnector) return this.selectedConnector.name || '';
    return '';
  }

  updateLabel(event: Event) {
    const value = (event.target as HTMLInputElement | HTMLTextAreaElement).value;
    if (this.selectedElement) {
      this.diagramService.updateElementProperty(this.selectedElement.id, 'label', value);
    } else if (this.selectedConnector) {
      this.diagramService.updateConnector(this.selectedConnector.id, { name: value });
    }
  }

  // --- Shared Properties: Stroke, Dotted, Font ---

  getStrokeColor(): string {
    const element = this.selectedElement as any;
    if (element) return element.borderColor || '#000000';
    return this.selectedConnector?.borderColor || '#000000';
  }

  updateStrokeColor(event: Event) {
    const color = (event.target as HTMLInputElement).value;
    const element = this.selectedElement;
    if (element) {
      this.diagramService.updateElementProperty(element.id, 'borderColor', color);
    } else if (this.selectedConnector) {
      this.diagramService.updateConnector(this.selectedConnector.id, { borderColor: color });
    }
  }

  getStrokeWidth(): number {
    const element = this.selectedElement;
    if (element && 'strokeWidth' in element) return element.strokeWidth !== undefined ? element.strokeWidth : 0.5;
    return this.selectedConnector?.strokeWidth !== undefined ? this.selectedConnector.strokeWidth : 0.5;
  }

  updateStrokeWidth(event: Event) {
    const width = parseFloat((event.target as HTMLSelectElement).value);
    const element = this.selectedElement;
    if (element) {
      this.diagramService.updateElementProperty(element.id, 'strokeWidth', width);
    } else if (this.selectedConnector) {
      this.diagramService.updateConnector(this.selectedConnector.id, { strokeWidth: width });
    }
  }

  getIsDotted(): boolean {
    const element = this.selectedElement;
    if (element && isNode(element)) return element.dotted;
    return this.selectedConnector?.dotted || false;
  }

  toggleDotted() {
    const newValue = !this.getIsDotted();
    if (this.selectedElement && isNode(this.selectedElement)) {
      this.diagramService.updateElementProperty(this.selectedElement.id, 'dotted', newValue);
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

  // --- Layered Property ---

  getSupportsLayered(): boolean {
    const element = this.selectedElement;
    if (!element) return false;
    if (isSvgImage(element)) return true;
    if (!isNode(element)) return false;
    return ['rectangle', 'pill', 'cylinder', 'circle', 'envelope', 'browser', 'mobile', 'octagon', 'package', 'shield', 'user', 'star', 'stickman', 'gear', 'roundedRectangle', 'pod', 'container', 'queue', 'diamond', 'parallelogram', 'document'].includes(element.shape);
  }

  getIsLayered(): boolean {
    const element = this.selectedElement;
    if (element && (isNode(element) || isSvgImage(element))) return !!(element as any).layered;
    return false;
  }

  toggleLayered() {
    const newValue = !this.getIsLayered();
    if (this.selectedElement && (isNode(this.selectedElement) || isSvgImage(this.selectedElement))) {
      this.diagramService.updateElementProperty(this.selectedElement.id, 'layered', newValue);
    }
  }

  // --- Brick Wall Property ---

  getIsBrickWall(): boolean {
    const element = this.selectedElement;
    if (element && isNode(element)) return !!element.brickWall;
    return false;
  }

  toggleBrickWall() {
    const newValue = !this.getIsBrickWall();
    if (this.selectedElement && isNode(this.selectedElement)) {
      this.diagramService.updateElementProperty(this.selectedElement.id, 'brickWall', newValue);
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
    return (this.selectedElement as any)?.fontFamily || 'Arial';
  }

  updateFontFamily(event: Event) {
    const font = (event.target as HTMLSelectElement).value;
    const element = this.selectedElement;
    if (element) {
      this.diagramService.updateElementProperty(element.id, 'fontFamily', font);
    }
  }

  getFontSize(): number {
    return (this.selectedElement as any)?.fontSize || 14;
  }

  updateFontSize(event: Event) {
    const size = parseInt((event.target as HTMLInputElement).value, 10);
    const element = this.selectedElement;
    if (element) {
      this.diagramService.updateElementProperty(element.id, 'fontSize', size);
    }
  }

  getFontWeight(): string {
    return (this.selectedElement as any)?.fontWeight || 'normal';
  }

  toggleFontWeight() {
    const current = this.getFontWeight();
    const newValue = current === 'bold' ? 'normal' : 'bold';
    const element = this.selectedElement;
    if (element) {
      this.diagramService.updateElementProperty(element.id, 'fontWeight', newValue);
    }
  }

  getFontStyle(): string {
    return (this.selectedElement as any)?.fontStyle || 'normal';
  }

  toggleFontStyle() {
    const current = this.getFontStyle();
    const newValue = current === 'italic' ? 'normal' : 'italic';
    const element = this.selectedElement;
    if (element) {
      this.diagramService.updateElementProperty(element.id, 'fontStyle', newValue);
    } else if (this.selectedConnector) {
      this.diagramService.updateConnector(this.selectedConnector.id, { fontStyle: newValue });
    }
  }

  // --- Connector Arrows ---

  getStartArrowType(): 'none' | 'arrow' | 'solid' {
    const val = this.selectedConnector?.startArrow;
    if (val === 'arrow' || val === true) return 'arrow';
    if (val === 'solid') return 'solid';
    return 'none';
  }

  updateStartArrowType(event: Event) {
    if (this.selectedConnector) {
      const value = (event.target as HTMLSelectElement).value as any;
      this.diagramService.updateConnector(this.selectedConnector.id, { startArrow: value });
    }
  }

  getEndArrowType(): 'none' | 'arrow' | 'solid' {
    const val = this.selectedConnector?.endArrow;
    if (val === 'arrow' || val === true) return 'arrow';
    if (val === 'solid') return 'solid';
    return 'none';
  }

  updateEndArrowType(event: Event) {
    if (this.selectedConnector) {
      const value = (event.target as HTMLSelectElement).value as any;
      this.diagramService.updateConnector(this.selectedConnector.id, { endArrow: value });
    }
  }

  // --- Rectangle Stereotypes ---

  getStereotypes(): string[] {
    return (this.selectedElement as any)?.attributes?.stereotypes || [];
  }

  updateStereotypes(event: Event) {
    const value = (event.target as HTMLTextAreaElement).value;
    const stereotypes = value.split(',').map(s => s.trim()).filter(Boolean);
    const currentAttributes = (this.selectedElement as any)?.attributes || {};
    this.diagramService.updateElementProperty(this.selectedElement!.id, 'attributes', {
      ...currentAttributes,
      stereotypes
    });
  }

  // --- Node Only Properties: Fill Color ---

  getFillColor(): string {
    return (this.selectedElement as any)?.fillColor || '#ffffff';
  }

  updateFillColor(event: Event) {
    const color = (event.target as HTMLInputElement).value;
    if (this.selectedElement) {
      this.diagramService.updateElementProperty(this.selectedElement.id, 'fillColor', color);
    }
  }

  getCrcCardData(): import('../../models/diagram.model').CrcCardData {
    const element = this.selectedElement;
    if (!element) return this.getDefaultCrcCardData();
    const data = (element as any).attributes?.crcCardData;
    if (typeof data === 'string') {
      try { return JSON.parse(data); } catch { return this.getDefaultCrcCardData(); }
    }
    return data || this.getDefaultCrcCardData();
  }

  getDefaultCrcCardData(): import('../../models/diagram.model').CrcCardData {
    return {
      className: '',
      superClasses: [],
      subClasses: [],
      description: '',
      attributes: [{ name: '', description: '' }],
      responsibilities: [{ name: '', collaborator: '' }]
    };
  }

  updateCrcCardData(updates: Partial<import('../../models/diagram.model').CrcCardData>) {
    const element = this.selectedElement;
    if (!element) return;
    const current = this.getCrcCardData();
    const merged = { ...current, ...updates };
    this.diagramService.updateElementProperty(element.id, 'attributes', {
      ...(element as any).attributes,
      crcCardData: merged
    });
  }

  updateCrcCardClassName(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.updateCrcCardData({ className: value });
  }

  updateCrcCardDescription(event: Event) {
    const value = (event.target as HTMLTextAreaElement).value;
    this.updateCrcCardData({ description: value });
  }

  updateCrcCardSuperClasses(event: Event) {
    const value = (event.target as HTMLTextAreaElement).value;
    this.updateCrcCardData({ superClasses: value.split(',').map(s => s.trim()).filter(Boolean) });
  }

  updateCrcCardSubClasses(event: Event) {
    const value = (event.target as HTMLTextAreaElement).value;
    this.updateCrcCardData({ subClasses: value.split(',').map(s => s.trim()).filter(Boolean) });
  }

  updateCrcCardAttribute(index: number, field: 'name' | 'description', event: Event) {
    const value = (event.target as HTMLInputElement).value;
    const attrs = [...this.getCrcCardData().attributes];
    if (!attrs[index]) attrs[index] = { name: '', description: '' };
    attrs[index][field] = value;
    this.updateCrcCardData({ attributes: attrs });
  }

  onCrcAttributeBlur(index: number) {
    const attrs = [...this.getCrcCardData().attributes];
    if (index >= attrs.length) return;
    const name = attrs[index].name.trim();
    const desc = attrs[index].description.trim();
    if (name && desc) {
      // Both filled → ensure trailing empty row exists for next input
      const last = attrs[attrs.length - 1];
      if (last && (last.name || last.description)) {
        attrs.push({ name: '', description: '' });
      }
      this.updateCrcCardData({ attributes: attrs });
    } else if (!name && !desc && attrs.length > 1) {
      // Both empty and not the only row → remove
      attrs.splice(index, 1);
      this.updateCrcCardData({ attributes: attrs });
    }
  }

  updateCrcCardResponsibility(index: number, field: 'name' | 'collaborator', event: Event) {
    const value = (event.target as HTMLInputElement).value;
    const resps = [...this.getCrcCardData().responsibilities];
    if (!resps[index]) resps[index] = { name: '', collaborator: '' };
    resps[index][field] = value;
    this.updateCrcCardData({ responsibilities: resps });
  }

  onCrcResponsibilityBlur(index: number) {
    const resps = [...this.getCrcCardData().responsibilities];
    if (index >= resps.length) return;
    const name = resps[index].name.trim();
    const collab = resps[index].collaborator.trim();
    if (name && collab) {
      // Both filled → ensure trailing empty row exists
      const last = resps[resps.length - 1];
      if (last && (last.name || last.collaborator)) {
        resps.push({ name: '', collaborator: '' });
      }
      this.updateCrcCardData({ responsibilities: resps });
    } else if (!name && !collab && resps.length > 1) {
      // Both empty and not the only row → remove
      resps.splice(index, 1);
      this.updateCrcCardData({ responsibilities: resps });
    }
  }

  getThreatTableData(): import('../../models/diagram.model').ThreatTableData {
    const element = this.selectedElement;
    if (!element) return this.getDefaultThreatTableData();
    const data = (element as any).attributes?.threatTableData;
    if (typeof data === 'string') {
      try { return JSON.parse(data); } catch { return this.getDefaultThreatTableData(); }
    }
    return data || this.getDefaultThreatTableData();
  }

  getDefaultThreatTableData(): import('../../models/diagram.model').ThreatTableData {
    return {
      title: '',
      col1Header: 'ID',
      col2Header: 'Description',
      collapsed: false,
      rows: [{ col1: '', col2: '' }]
    };
  }

  updateThreatTableData(updates: Partial<import('../../models/diagram.model').ThreatTableData>) {
    const element = this.selectedElement;
    if (!element) return;
    const current = this.getThreatTableData();
    const merged = { ...current, ...updates };
    this.diagramService.updateElementProperty(element.id, 'attributes', {
      ...(element as any).attributes,
      threatTableData: merged
    });
  }

  updateThreatTableTitle(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.updateThreatTableData({ title: value });
  }

  updateThreatTableCol1Header(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.updateThreatTableData({ col1Header: value });
  }

  updateThreatTableCol2Header(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.updateThreatTableData({ col2Header: value });
  }

  updateThreatTableRow(index: number, field: 'col1' | 'col2', event: Event) {
    const value = (event.target as HTMLInputElement).value;
    const rows = [...this.getThreatTableData().rows];
    if (!rows[index]) rows[index] = { col1: '', col2: '' };
    rows[index][field] = value;
    this.updateThreatTableData({ rows });
  }

  onThreatTableRowBlur(index: number) {
    const rows = [...this.getThreatTableData().rows];
    if (index >= rows.length) return;
    const col1 = rows[index].col1.trim();
    const col2 = rows[index].col2.trim();
    if (col1 && col2) {
      const last = rows[rows.length - 1];
      if (last && (last.col1 || last.col2)) {
        rows.push({ col1: '', col2: '' });
      }
      this.updateThreatTableData({ rows });
    } else if (!col1 && !col2 && rows.length > 1) {
      rows.splice(index, 1);
      this.updateThreatTableData({ rows });
    }
  }
}
