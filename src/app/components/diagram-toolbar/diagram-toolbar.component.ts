// Forced rebuild to resolve stale template issues
import { Component, HostListener, Inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
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
  // Dropdown state for "Add" button
  isAddDropdownOpen = false;

  // Dropdown state for Instructions
  isInstructionsOpen = false;
  isChaosMode = false;
  isMac = false;

  constructor(
    private diagramService: DiagramService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {
    if (isPlatformBrowser(this.platformId)) {
      this.isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform) ||
                   (navigator.userAgent.indexOf('Mac') !== -1);
    }
  }

  get modifierKey(): string {
    return this.isMac ? 'Cmd' : 'Ctrl';
  }

  get state(): import('../../models/diagram.model').DiagramState {
    return this.diagramService.currentState;
  }

  newDiagram(): void {
    const state = this.diagramService.currentState;
    const hasElements = state.currentDiagram.elements.length > 0 ||
                        state.currentDiagram.boundingBoxes.length > 0 ||
                        (state.currentDiagram.connectors || []).length > 0;

    if (hasElements && !confirm('Are you sure you want to clear the canvas? All unsaved progress will be lost.')) {
      return;
    }

    this.diagramService.resetDiagram();
  }

  toggleAddDropdown(): void {
    this.isAddDropdownOpen = !this.isAddDropdownOpen;
  }

  closeAddDropdown(): void {
    this.isAddDropdownOpen = false;
  }

  toggleInstructions(): void {
    this.isInstructionsOpen = !this.isInstructionsOpen;
  }

  closeInstructions(): void {
    this.isInstructionsOpen = false;
  }

  toggleChaosMode(): void {
    this.isChaosMode = !this.isChaosMode;
  }

  closeAllDropdowns(): void {
    this.isAddDropdownOpen = false;
    this.isInstructionsOpen = false;
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscapeKey(event: Event) {
    this.closeAllDropdowns();
  }

  addNewNode(shape: string = 'rectangle'): void {
    this.closeAddDropdown();

    // Use viewport center if available, otherwise fallback to reasonable default
    const viewportCenter = this.diagramService.currentState.viewportCenter;
    const position = {
      x: (viewportCenter?.x || 500) - 50 + (Math.random() * 20),
      y: (viewportCenter?.y || 300) - 30 + (Math.random() * 20)
    };

    // Create the node(s). If chaos mode is on, spawn 4-7 nodes.
    const count = this.isChaosMode ? Math.floor(Math.random() * 4) + 4 : 1;

    for (let i = 0; i < count; i++) {
      // Add slight randomization to position if adding multiple
      const offsetPos = {
        x: Math.max(0, position.x + (this.isChaosMode ? (Math.random() * 200 - 100) : 0)),
        y: Math.max(0, position.y + (this.isChaosMode ? (Math.random() * 200 - 100) : 0))
      };

      this.diagramService.addNode(offsetPos, {
        shape: shape,
      });
    }

  }

  addNewBoundingBox(): void {
    // Use viewport center if available
    const viewportCenter = this.diagramService.currentState.viewportCenter;
    const position = {
      x: (viewportCenter?.x || 500) - 100 + (Math.random() * 20),
      y: (viewportCenter?.y || 300) - 100 + (Math.random() * 20)
    };
    this.diagramService.addBoundingBox(position);
  }

  isSingleElementSelected(): boolean {
    const state = this.diagramService.currentState;
    const nodeCount = state.selectedNodeIds.length;
    const svgCount = state.selectedSvgImageIds.length;

    if (nodeCount + svgCount !== 1) return false;

    const id = nodeCount === 1 ? state.selectedNodeIds[0] : state.selectedSvgImageIds[0];
    const element = state.currentDiagram.elements.find(el => el.id === id);
    return !!element && (isNode(element) || isSvgImage(element));
  }

  rotate90(): void {
    if (this.isSingleElementSelected() && !this.isNoteSelected) {
      this.diagramService.toggleRotation(90);
    }
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
    const elementsToRemove = svgClone.querySelectorAll('.resize-handle');
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

        // If chaos mode is on, spawn 4-7 images.
        const count = this.isChaosMode ? Math.floor(Math.random() * 4) + 4 : 1;
        const viewportCenter = this.diagramService.currentState.viewportCenter;
        const basePosition = {
          x: (viewportCenter?.x || 500) - 40,
          y: (viewportCenter?.y || 300) - 25
        };

        for (let i = 0; i < count; i++) {
          const offsetPos = {
            x: Math.max(0, basePosition.x + (this.isChaosMode ? (Math.random() * 200 - 100) : (i * 20))),
            y: Math.max(0, basePosition.y + (this.isChaosMode ? (Math.random() * 200 - 100) : (i * 20)))
          };
          this.diagramService.addSvgImage(svgContent, file.name, offsetPos);
        }
      };
      reader.readAsText(file);
    }
    // Reset input
    input.value = '';
  }

  viewSvgImage(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const svgContent = e.target?.result as string;
        this.diagramService.setViewSvgContent(svgContent, file.name);
      };
      reader.readAsText(file);
    }
    // Reset input
    input.value = '';
  }

  getCurrentDiagramName(): string {
    return this.diagramService.currentState.currentDiagram.name || '';
  }

  goBack(): void {
    this.diagramService.goBack();
  }

  get canGoBack(): boolean {
    return this.diagramService.currentState.diagramStack.length > 0;
  }

  deleteSelectedElement(): void {
    const state = this.diagramService.currentState;

    // Collect all selected element IDs across all types for batch delete
    const nodeIds = state.selectedNodeIds;
    const svgIds = state.selectedSvgImageIds;
    const allElementIds = [...nodeIds, ...svgIds];

    if (allElementIds.length > 0) {
      this.diagramService.deleteElements(allElementIds);
    } else if (state.selectedBoundingBoxId) {
      this.diagramService.deleteBoundingBox(state.selectedBoundingBoxId);
    }

    this.diagramService.clearSelection();
  }

  get selectedElementId(): string | undefined {
    return this.diagramService.currentState.selectedNodeId ||
           this.diagramService.currentState.selectedSvgImageId ||
           this.diagramService.currentState.selectedBoundingBoxId ||
           (this.diagramService.currentState.selectedConnectorIds || [])[0];
  }

  get selectedElement(): DiagramElement | any | undefined {
    const elementId = this.selectedElementId;
    if (!elementId) return undefined;

    return this.diagramService.getElement(elementId);
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

  get selectedConnectorId(): string | undefined {
    return (this.diagramService.currentState.selectedConnectorIds || [])[0];
  }

  get isNoteSelected(): boolean {
    const element = this.selectedElement;
    return !!(element && isNode(element) && element.shape === 'note');
  }

  get isBoundingBoxSelected(): boolean {
    return !!this.selectedBoundingBoxId;
  }

  // Unified element getter methods
  getSelectedElementName(): string {
    const element = this.selectedElement;
    if (!element) return '';
    return element.label || element.name || '';
  }

  updateElementName(event: Event): void {
    const target = event.target as HTMLInputElement;
    const value = target.value;

    const elementId = this.selectedElementId;
    if (elementId) {
      const element = this.diagramService.getElement(elementId);
      if (element) {
        this.diagramService.updateElement(elementId, { label: value });
      }
    }
  }


  // Template helper methods
  isNode(element: DiagramElement): boolean {
    return isNode(element);
  }

}
