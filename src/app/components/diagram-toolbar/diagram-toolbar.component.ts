// Forced rebuild to resolve stale template issues
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DiagramService } from '../../services/diagram.service';
import { DiagramElement, Tendril, isNode, isSvgImage } from '../../models/diagram.model';

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

  constructor(private diagramService: DiagramService) {
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
      selectedEdgeIds: [],
      selectedConnectorIds: []
    });
  }

  toggleAddDropdown(): void {
    this.isAddDropdownOpen = !this.isAddDropdownOpen;
  }

  closeAddDropdown(): void {
    this.toggleAddDropdown();
  }

  toggleInstructions(): void {
    this.isInstructionsOpen = !this.isInstructionsOpen;
  }

  closeInstructions(): void {
    this.isInstructionsOpen = false;
  }

  closeAllDropdowns(): void {
    this.isAddDropdownOpen = false;
    this.isInstructionsOpen = false;
  }

  addNewNode(shape: string = 'rectangle'): void {
    this.closeAddDropdown();
    // Position around the upper-center of the canvas
    const position = {
      x: 350 + (Math.random() * 50),
      y: 150 + (Math.random() * 50)
    };

    // Create the node with default minimal shape settings
    this.diagramService.addNode(position, {
      shape: shape,
    });

    // Find the newly created node and select it
    const currentElements = this.diagramService.currentState.currentDiagram.elements;
    const newNode = currentElements[currentElements.length - 1];
    if (newNode) {
      this.diagramService.selectNode(newNode.id);
    }
  }

  addNewBoundingBox(): void {
    // Position around the upper-center of the canvas
    const position = {
      x: 350 + (Math.random() * 50),
      y: 150 + (Math.random() * 50)
    };
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

    // If a tendril is selected, delete the tendril — NOT the parent node
    if (state.selectedTendrilId) {
      const parentNodeId = state.selectedNodeIds[0];
      if (parentNodeId && state.selectedTendrilId) {
        this.diagramService.deleteTendril(parentNodeId, state.selectedTendrilId);
      }
      this.diagramService.clearSelection();
      return;
    }

    if (state.selectedNodeId) {
      this.diagramService.deleteNode(state.selectedNodeId);
    } else if (state.selectedSvgImageId) {
      this.diagramService.deleteNode(state.selectedSvgImageId);
    } else if (state.selectedBoundingBoxId) {
      this.diagramService.deleteBoundingBox(state.selectedBoundingBoxId);
    }

    this.diagramService.clearSelection();
  }

  deleteSelectedTendril(): void {
    const selectedNodeId = this.diagramService.currentState.selectedNodeId;
    const selectedTendrilId = this.diagramService.currentState.selectedTendrilId;
    if (selectedNodeId && selectedTendrilId) {
      this.diagramService.deleteTendril(selectedNodeId, selectedTendrilId);
    }
  }

  get selectedElementId(): string | undefined {
    return this.diagramService.currentState.selectedNodeId ||
           this.diagramService.currentState.selectedSvgImageId ||
           this.diagramService.currentState.selectedBoundingBoxId ||
           this.diagramService.currentState.selectedEdgeId ||
           (this.diagramService.currentState.selectedConnectorIds || [])[0];
  }

  get selectedElement(): DiagramElement | any | undefined {
    const elementId = this.selectedElementId;
    if (!elementId) return undefined;

    // Check elements
    const element = this.diagramService.getElement(elementId);
    if (element) return element;

    // Check edges
    return this.diagramService.getEdge(elementId);
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
  get selectedTendril(): Tendril | undefined {
    const tendrilId = this.diagramService.currentState.selectedTendrilId;
    if (!tendrilId) return undefined;
    return this.diagramService.getTendrilById(tendrilId) || undefined;
  }

  getSelectedElementName(): string {
    // Tendril takes priority — show its name, not the parent node's label
    const tendril = this.selectedTendril;
    if (tendril) return tendril.name || '';

    const element = this.selectedElement;
    if (!element) return '';
    return element.label || element.name || '';
  }

  updateElementName(event: Event): void {
    const target = event.target as HTMLInputElement;
    const value = target.value;

    // If a tendril is selected, rename the tendril
    const tendrilId = this.diagramService.currentState.selectedTendrilId;
    if (tendrilId) {
      const parentNodeId = this.diagramService.currentState.selectedNodeIds[0];
      if (parentNodeId) {
        this.diagramService.updateTendril(parentNodeId, tendrilId, { name: value });
      }
      return;
    }

    const elementId = this.selectedElementId;
    if (elementId) {
      const element = this.diagramService.getElement(elementId);
      if (element) {
        this.diagramService.updateElement(elementId, { label: value });
      } else {
        const edge = this.diagramService.getEdge(elementId);
        if (edge) {
          this.diagramService.updateEdgeProperty(elementId, 'name', value);
        }
      }
    }
  }


  // Template helper methods
  isNode(element: DiagramElement): boolean {
    return isNode(element);
  }

}
