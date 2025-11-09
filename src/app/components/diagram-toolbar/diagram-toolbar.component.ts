import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DiagramService } from '../../services/diagram.service';
import { DiagramElement, isNode, isSvgImage } from '../../models/diagram.model';

@Component({
  selector: 'app-diagram-toolbar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './diagram-toolbar.component.html',
  styleUrls: ['./diagram-toolbar.component.sass']
})
export class DiagramToolbarComponent {
  isCollapsed = false;
  sidebarWidth = 380;

  // Default shape settings for new nodes
  defaultShape: string = 'rectangle';
  defaultBorderColor: string = '#000000';
  defaultFillColor: string = '#ffffff';
  defaultDotted: boolean = false;

  // Accordion states - collapsed by default
  notesExpanded = false;
  svgNotesExpanded = false;
  tendrilNotesExpanded = false;
  edgeNotesExpanded = false;
  instructionsExpanded = false;

  constructor(private diagramService: DiagramService) {
    // Load saved sidebar state
    this.loadSidebarState();
    // Load saved default shape settings
    this.loadDefaultShapeSettings();
  }

  newDiagram(): void {
    // Reset the diagram service state
    this.diagramService['stateSubject'].next({
      currentDiagram: this.diagramService['createEmptyDiagram'](),
      diagramStack: [],
      selectedNodeIds: [],
      selectedTendrilId: undefined,
      selectedBoundingBoxIds: [],
      selectedSvgImageIds: [],
      selectedEdgeIds: []
    });
  }

  addNewNode(): void {
    // Add node at a random position on the canvas
    const canvasWidth = 800;
    const canvasHeight = 600;
    const margin = 50; // Keep elements away from edges

    const position = {
      x: margin + Math.random() * (canvasWidth - 2 * margin),
      y: margin + Math.random() * (canvasHeight - 2 * margin)
    };

    // Create the node with default shape settings
    this.diagramService.addNode(position, {
      shape: this.defaultShape,
      borderColor: this.defaultBorderColor,
      fillColor: this.defaultFillColor,
      dotted: this.defaultDotted
    });

    // Find the newly created node and select it
    // Since we just added it, it should be the last element in the array
    const currentElements = this.diagramService.currentState.currentDiagram.elements;
    const newNode = currentElements[currentElements.length - 1];
    if (newNode) {
      this.diagramService.selectNode(newNode.id);
    }
  }

  addNewBoundingBox(): void {
    // Add bounding box at a default position
    const position = { x: 300, y: 200 };
    this.diagramService.addBoundingBox(position);
  }

  addIncomingTendril(): void {
    const selectedElementId = this.diagramService.currentState.selectedNodeId || this.diagramService.currentState.selectedSvgImageId;
    if (selectedElementId) {
      this.addTendrilToElement(selectedElementId, 'incoming');
    }
  }

  addOutgoingTendril(): void {
    const selectedElementId = this.diagramService.currentState.selectedNodeId || this.diagramService.currentState.selectedSvgImageId;
    if (selectedElementId) {
      this.addTendrilToElement(selectedElementId, 'outgoing');
    }
  }

  private addTendrilToElement(elementId: string, type: 'incoming' | 'outgoing'): void {
    // Get the element from the unified elements array
    const element = this.diagramService.currentState.currentDiagram.elements.find(e => e.id === elementId);
    if (!element) return;

    // Count existing tendrils of this type
    const tendrilCount = element.tendrils.filter(t => t.type === type).length;

    // Calculate vertical spacing for tendrils along the appropriate edge
    const spacing = element.size.height / (tendrilCount + 1);
    const y = spacing * (tendrilCount + 0.5); // Center between existing tendrils

    const position = {
      x: type === 'incoming' ? 0 : element.size.width,
      y: Math.max(10, Math.min(element.size.height - 10, y)) // Keep within element bounds
    };

    this.diagramService.addTendril(elementId, type, position);
  }

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

  loadDiagram(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const json = e.target?.result as string;
        this.diagramService.loadDiagram(json);
      };
      reader.readAsText(file);
    }
    // Reset input
    input.value = '';
  }

  exportToSvg(): void {
    // Find the SVG canvas element
    const svgElement = document.querySelector('.diagram-canvas') as SVGElement;
    if (!svgElement) {
      console.error('SVG canvas element not found');
      return;
    }

    // Clone the SVG to avoid modifying the original
    const svgClone = svgElement.cloneNode(true) as SVGElement;

    // Remove interactive elements that shouldn't be in the exported SVG
    // Remove resize handles, click areas, and other interactive elements
    const elementsToRemove = svgClone.querySelectorAll('.resize-handle, .tendril-click-area');
    elementsToRemove.forEach(el => el.remove());

    // Get the SVG content as string
    const svgContent = new XMLSerializer().serializeToString(svgClone);

    // Create a blob and download link
    const blob = new Blob([svgContent], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;

    // Use diagram name for filename, fallback to 'diagram.svg'
    const diagramName = this.getCurrentDiagramName() || 'diagram';
    const filename = `${diagramName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.svg`;
    a.download = filename;

    // Trigger download
    a.click();

    // Clean up
    URL.revokeObjectURL(url);
  }

  loadSvgImage(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const svgContent = e.target?.result as string;
        this.diagramService.addSvgImage(svgContent, file.name);

        // Find the newly created SVG image and select it
        // Since we just added it, it should be the last element in the array
        const currentElements = this.diagramService.currentState.currentDiagram.elements;
        const newSvgImage = currentElements[currentElements.length - 1];
        if (newSvgImage) {
          this.diagramService.selectSvgImage(newSvgImage.id);
        }
      };
      reader.readAsText(file);
    }
    // Reset input
    input.value = '';
  }

  goBack(): void {
    this.diagramService.goBack();
  }

  get canGoBack(): boolean {
    return this.diagramService.currentState.diagramStack.length > 0;
  }

  deleteSelectedNode(): void {
    const selectedNodeId = this.diagramService.currentState.selectedNodeId;
    if (selectedNodeId) {
      this.diagramService.deleteNode(selectedNodeId);
    }
  }

  deleteSelectedTendril(): void {
    const selectedNodeId = this.diagramService.currentState.selectedNodeId;
    const selectedTendrilId = this.diagramService.currentState.selectedTendrilId;
    if (selectedNodeId && selectedTendrilId) {
      this.diagramService.deleteTendril(selectedNodeId, selectedTendrilId);
    }
  }

  get selectedElementId(): string | undefined {
    return this.diagramService.currentState.selectedNodeId || this.diagramService.currentState.selectedSvgImageId;
  }

  get selectedElement(): DiagramElement | undefined {
    const elementId = this.selectedElementId;
    const element = elementId ? this.diagramService.getElement(elementId) : undefined;

    // Auto-expand notes accordion if element has notes
    if (element && element.notes && element.notes.trim().length > 0) {
      this.notesExpanded = true;
    }

    return element;
  }

  get selectedNodeId(): string | undefined {
    return this.diagramService.currentState.selectedNodeId;
  }

  get selectedBoundingBoxId(): string | undefined {
    return this.diagramService.currentState.selectedBoundingBoxId;
  }

  get selectedSvgImageId(): string | undefined {
    return this.diagramService.currentState.selectedSvgImageId;
  }

  get selectedTendrilId(): string | undefined {
    return this.diagramService.currentState.selectedTendrilId;
  }

  get selectedEdgeId(): string | undefined {
    return this.diagramService.currentState.selectedEdgeId;
  }

  // Unified element getter methods
  getSelectedElementName(): string {
    const element = this.selectedElement;
    if (element) {
      if (isNode(element)) {
        return element.label || '';
      } else if (isSvgImage(element)) {
        return element.label || '';
      }
    }
    return '';
  }

  getSelectedElementNotes(): string {
    const element = this.selectedElement;
    return element?.notes ?? '';
  }

  getSelectedElementFillColor(): string {
    const element = this.selectedElement;
    if (element && isNode(element)) {
      return element.fillColor || '#ffffff';
    }
    return '#ffffff';
  }

  getSelectedElementBorderColor(): string {
    const element = this.selectedElement;
    if (element && isNode(element)) {
      return element.borderColor || '#000000';
    }
    return '#000000';
  }

  getSelectedElementShape(): string {
    const element = this.selectedElement;
    if (element && isNode(element)) {
      return element.shape || 'rectangle';
    }
    return 'rectangle';
  }

  getSelectedElementDotted(): boolean {
    const element = this.selectedElement;
    if (element && isNode(element)) {
      return element.dotted || false;
    }
    return false;
  }

  // Unified element update methods
  updateElementName(event: Event): void {
    const elementId = this.selectedElementId;
    if (elementId) {
      const target = event.target as HTMLInputElement;
      this.diagramService.updateElement(elementId, { label: target.value });
    }
  }

  updateElementNotes(event: Event): void {
    const elementId = this.selectedElementId;
    if (elementId) {
      const target = event.target as HTMLTextAreaElement;
      this.diagramService.updateElement(elementId, { notes: target.value });
    }
  }

  updateElementFillColor(event: Event): void {
    const elementId = this.selectedElementId;
    if (elementId) {
      const target = event.target as HTMLInputElement;
      this.diagramService.updateElement(elementId, { fillColor: target.value });
    }
  }

  updateElementBorderColor(event: Event): void {
    const elementId = this.selectedElementId;
    if (elementId) {
      const target = event.target as HTMLInputElement;
      this.diagramService.updateElement(elementId, { borderColor: target.value });
    }
  }

  setElementShape(shape: string): void {
    const elementId = this.selectedElementId;
    if (elementId) {
      this.diagramService.updateElement(elementId, { shape: shape as any });
      // Update default shape for new nodes
      this.defaultShape = shape;
      this.saveDefaultShapeSettings();
    }
  }

  setElementDotted(dotted: boolean): void {
    const elementId = this.selectedElementId;
    if (elementId) {
      this.diagramService.updateElement(elementId, { dotted });
      // Update default border style for new nodes
      this.defaultDotted = dotted;
      this.saveDefaultShapeSettings();
    }
  }

  // Legacy methods for backward compatibility
  getSelectedNodeFillColor(): string {
    return this.getSelectedElementFillColor();
  }

  getSelectedNodeBorderColor(): string {
    return this.getSelectedElementBorderColor();
  }

  updateNodeFillColor(event: Event): void {
    this.updateElementFillColor(event);
  }

  updateNodeBorderColor(event: Event): void {
    this.updateElementBorderColor(event);
  }

  getSelectedNodeNotes(): string {
    return this.getSelectedElementNotes();
  }

  updateNodeNotes(event: Event): void {
    this.updateElementNotes(event);
  }

  getSelectedNodeName(): string {
    return this.getSelectedElementName();
  }

  updateNodeName(event: Event): void {
    this.updateElementName(event);
  }

  getSelectedNodeShape(): string {
    return this.getSelectedElementShape();
  }

  setNodeShape(shape: string): void {
    this.setElementShape(shape);
  }

  getSelectedTendrilName(): string {
    const selectedNodeId = this.selectedNodeId;
    const selectedTendrilId = this.selectedTendrilId;
    if (selectedNodeId && selectedTendrilId) {
      const tendril = this.diagramService.getTendrilAny(selectedNodeId, selectedTendrilId);
      return tendril?.name || '';
    }
    return '';
  }

  getSelectedTendrilTypeLabel(): string {
    const selectedNodeId = this.selectedNodeId;
    const selectedTendrilId = this.selectedTendrilId;
    if (selectedNodeId && selectedTendrilId) {
      const tendril = this.diagramService.getTendrilAny(selectedNodeId, selectedTendrilId);
      return tendril?.type === 'incoming' ? 'Incoming Tendril Name' : 'Outgoing Tendril Name';
    }
    return 'Tendril Name';
  }

  updateTendrilName(event: Event): void {
    const selectedNodeId = this.selectedNodeId;
    const selectedTendrilId = this.selectedTendrilId;
    if (selectedNodeId && selectedTendrilId) {
      const target = event.target as HTMLInputElement;
      this.diagramService.updateTendril(selectedNodeId, selectedTendrilId, { name: target.value });
    }
  }

  getSelectedTendrilExposed(): boolean {
    const selectedNodeId = this.selectedNodeId;
    const selectedTendrilId = this.selectedTendrilId;
    if (selectedNodeId && selectedTendrilId) {
      const tendril = this.diagramService.getTendrilAny(selectedNodeId, selectedTendrilId);
      return tendril?.exposed || false;
    }
    return false;
  }

  setTendrilExposed(exposed: boolean): void {
    const selectedNodeId = this.selectedNodeId;
    const selectedTendrilId = this.selectedTendrilId;
    if (selectedNodeId && selectedTendrilId) {
      this.diagramService.updateTendril(selectedNodeId, selectedTendrilId, { exposed });
    }
  }

  getSelectedTendrilType(): string {
    const selectedNodeId = this.selectedNodeId;
    const selectedTendrilId = this.selectedTendrilId;
    if (selectedNodeId && selectedTendrilId) {
      const tendril = this.diagramService.getTendrilAny(selectedNodeId, selectedTendrilId);
      return tendril?.type || 'incoming';
    }
    return 'incoming';
  }

  setTendrilType(type: 'incoming' | 'outgoing'): void {
    const selectedElementId = this.selectedNodeId || this.selectedSvgImageId;
    const selectedTendrilId = this.selectedTendrilId;
    if (selectedElementId && selectedTendrilId) {
      // Get current tendril to check if name needs updating
      const currentTendril = this.diagramService.getTendrilAny(selectedElementId, selectedTendrilId);
      const currentName = currentTendril?.name || '';

      // Check if name is still the default value and update it
      let newName = currentName;
      if (currentName === 'Incoming Tendril' && type === 'outgoing') {
        newName = 'Outgoing Tendril';
      } else if (currentName === 'Outgoing Tendril' && type === 'incoming') {
        newName = 'Incoming Tendril';
      }

      // Update the tendril
      const updates: any = { type };
      if (newName !== currentName) {
        updates.name = newName;
      }

      this.diagramService.updateTendril(selectedElementId, selectedTendrilId, updates);
    }
  }

  getSelectedBoundingBoxLabel(): string {
    const selectedBoundingBoxId = this.selectedBoundingBoxId;
    if (selectedBoundingBoxId) {
      const box = this.diagramService.currentState.currentDiagram.boundingBoxes.find(b => b.id === selectedBoundingBoxId);
      return box?.label || '';
    }
    return '';
  }

  updateBoundingBoxLabel(event: Event): void {
    const selectedBoundingBoxId = this.selectedBoundingBoxId;
    if (selectedBoundingBoxId) {
      const target = event.target as HTMLInputElement;
      this.diagramService.updateBoundingBox(selectedBoundingBoxId, { label: target.value });
    }
  }

  getSelectedBoundingBoxFillColor(): string {
    const selectedBoundingBoxId = this.selectedBoundingBoxId;
    if (selectedBoundingBoxId) {
      const box = this.diagramService.currentState.currentDiagram.boundingBoxes.find(b => b.id === selectedBoundingBoxId);
      return box?.fillColor || 'rgba(255, 255, 0, 0.3)';
    }
    return 'rgba(255, 255, 0, 0.3)';
  }

  getSelectedBoundingBoxBorderColor(): string {
    const selectedBoundingBoxId = this.selectedBoundingBoxId;
    if (selectedBoundingBoxId) {
      const box = this.diagramService.currentState.currentDiagram.boundingBoxes.find(b => b.id === selectedBoundingBoxId);
      return box?.borderColor || '#666666';
    }
    return '#666666';
  }

  updateBoundingBoxFillColor(event: Event): void {
    const selectedBoundingBoxId = this.selectedBoundingBoxId;
    if (selectedBoundingBoxId) {
      const target = event.target as HTMLInputElement;
      this.diagramService.updateBoundingBox(selectedBoundingBoxId, { fillColor: target.value });
    }
  }

  updateBoundingBoxBorderColor(event: Event): void {
    const selectedBoundingBoxId = this.selectedBoundingBoxId;
    if (selectedBoundingBoxId) {
      const target = event.target as HTMLInputElement;
      this.diagramService.updateBoundingBox(selectedBoundingBoxId, { borderColor: target.value });
    }
  }

  deleteSelectedBoundingBox(): void {
    const selectedBoundingBoxId = this.selectedBoundingBoxId;
    if (selectedBoundingBoxId) {
      this.diagramService.deleteBoundingBox(selectedBoundingBoxId);
    }
  }

  getSelectedBoundingBoxRounded(): boolean {
    const selectedBoundingBoxId = this.selectedBoundingBoxId;
    if (selectedBoundingBoxId) {
      const box = this.diagramService.currentState.currentDiagram.boundingBoxes.find(b => b.id === selectedBoundingBoxId);
      return box?.rounded || false;
    }
    return false;
  }

  setBoundingBoxRounded(rounded: boolean): void {
    const selectedBoundingBoxId = this.selectedBoundingBoxId;
    if (selectedBoundingBoxId) {
      this.diagramService.updateBoundingBox(selectedBoundingBoxId, { rounded });
    }
  }

  getSelectedSvgImageLabel(): string {
    const selectedSvgImageId = this.selectedSvgImageId;
    if (selectedSvgImageId) {
      const svgImage = this.diagramService.getSvgImage(selectedSvgImageId);
      return svgImage?.label || '';
    }
    return '';
  }

  updateSvgImageLabel(event: Event): void {
    const selectedSvgImageId = this.selectedSvgImageId;
    if (selectedSvgImageId) {
      const target = event.target as HTMLInputElement;
      this.diagramService.updateSvgImage(selectedSvgImageId, { label: target.value });
    }
  }

  getSelectedSvgImageNotes(): string {
    const selectedSvgImageId = this.selectedSvgImageId;
    if (selectedSvgImageId) {
      const svgImage = this.diagramService.getSvgImage(selectedSvgImageId);
      return svgImage?.notes ?? '';
    }
    return '';
  }

  updateSvgImageNotes(event: Event): void {
    const selectedSvgImageId = this.selectedSvgImageId;
    if (selectedSvgImageId) {
      const target = event.target as HTMLTextAreaElement;
      this.diagramService.updateSvgImage(selectedSvgImageId, { notes: target.value });
    }
  }

  getSelectedTendrilNotes(): string {
    const selectedNodeId = this.selectedNodeId;
    const selectedTendrilId = this.selectedTendrilId;
    if (selectedNodeId && selectedTendrilId) {
      const tendril = this.diagramService.getTendrilAny(selectedNodeId, selectedTendrilId);
      return tendril?.notes ?? '';
    }
    return '';
  }

  updateTendrilNotes(event: Event): void {
    const selectedNodeId = this.selectedNodeId;
    const selectedTendrilId = this.selectedTendrilId;
    if (selectedNodeId && selectedTendrilId) {
      const target = event.target as HTMLTextAreaElement;
      this.diagramService.updateTendril(selectedNodeId, selectedTendrilId, { notes: target.value });
    }
  }

  getSelectedEdgeNotes(): string {
    const selectedEdgeId = this.selectedEdgeId;
    if (selectedEdgeId) {
      const edge = this.diagramService.getEdge(selectedEdgeId);
      return edge?.notes ?? '';
    }
    return '';
  }

  updateEdgeNotes(event: Event): void {
    const selectedEdgeId = this.selectedEdgeId;
    if (selectedEdgeId) {
      const target = event.target as HTMLTextAreaElement;
      this.diagramService.updateEdge(selectedEdgeId, { notes: target.value });
    }
  }

  getSelectedEdgeName(): string {
    const selectedEdgeId = this.selectedEdgeId;
    if (selectedEdgeId) {
      const edge = this.diagramService.getEdge(selectedEdgeId);
      return edge?.name || '';
    }
    return '';
  }

  updateEdgeName(event: Event): void {
    const selectedEdgeId = this.selectedEdgeId;
    if (selectedEdgeId) {
      const target = event.target as HTMLInputElement;
      this.diagramService.updateEdge(selectedEdgeId, { name: target.value });
    }
  }

  deleteSelectedEdge(): void {
    const selectedEdgeId = this.selectedEdgeId;
    if (selectedEdgeId) {
      this.diagramService.deleteEdge(selectedEdgeId);
    }
  }

  getCurrentDiagramName(): string {
    return this.diagramService.currentState.currentDiagram.name || '';
  }

  updateCurrentDiagramName(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.diagramService.updateCurrentDiagramName(target.value);
  }

  toggleSidebar(): void {
    this.isCollapsed = !this.isCollapsed;
    this.saveSidebarState();
    this.updateMainContentMargin();
  }

  private loadSidebarState(): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = localStorage.getItem('diagram-sidebar-state');
      if (saved) {
        try {
          const state = JSON.parse(saved);
          this.isCollapsed = state.isCollapsed || false;
          this.sidebarWidth = state.sidebarWidth || 380;
          this.updateMainContentMargin();
        } catch (error) {
          console.warn('Failed to load sidebar state:', error);
        }
      }
    }
  }

  private saveSidebarState(): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const state = {
          isCollapsed: this.isCollapsed,
          sidebarWidth: this.sidebarWidth
        };
        localStorage.setItem('diagram-sidebar-state', JSON.stringify(state));
      } catch (error) {
        console.warn('Failed to save sidebar state:', error);
      }
    }
  }

  private loadDefaultShapeSettings(): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = localStorage.getItem('diagram-default-shape-settings');
      if (saved) {
        try {
          const settings = JSON.parse(saved);
          this.defaultShape = settings.shape || 'rectangle';
          this.defaultBorderColor = settings.borderColor || '#000000';
          this.defaultFillColor = settings.fillColor || '#ffffff';
          this.defaultDotted = settings.dotted || false;
        } catch (error) {
          console.warn('Failed to load default shape settings:', error);
        }
      }
    }
  }

  private saveDefaultShapeSettings(): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const settings = {
          shape: this.defaultShape,
          borderColor: this.defaultBorderColor,
          fillColor: this.defaultFillColor,
          dotted: this.defaultDotted
        };
        localStorage.setItem('diagram-default-shape-settings', JSON.stringify(settings));
      } catch (error) {
        console.warn('Failed to save default shape settings:', error);
      }
    }
  }

  updateMainContentMargin(): void {
    // Update the main content margin dynamically
    const mainContent = document.querySelector('.main-content') as HTMLElement;
    if (mainContent) {
      const marginLeft = this.isCollapsed ? '50px' : `${this.sidebarWidth}px`;
      mainContent.style.marginLeft = marginLeft;
    }

    // Also update the resize handle position
    const resizeHandle = document.querySelector('.resize-handle') as HTMLElement;
    if (resizeHandle) {
      const handlePosition = this.isCollapsed ? 50 : this.sidebarWidth;
      resizeHandle.style.left = `${handlePosition}px`;
    }
  }

  // Template helper methods
  isNode(element: DiagramElement): boolean {
    return isNode(element);
  }
}
