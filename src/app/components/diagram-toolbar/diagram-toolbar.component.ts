import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DiagramService } from '../../services/diagram.service';

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

  // Accordion states - collapsed by default
  notesExpanded = false;
  instructionsExpanded = false;

  constructor(private diagramService: DiagramService) {
    // Load saved sidebar state
    this.loadSidebarState();
  }

  newDiagram(): void {
    // Reset the diagram service state
    this.diagramService['stateSubject'].next({
      currentDiagram: this.diagramService['createEmptyDiagram'](),
      diagramStack: [],
      selectedNodeId: undefined,
      selectedTendrilId: undefined
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
    this.diagramService.addNode(position);
  }

  addNewBoundingBox(): void {
    // Add bounding box at a default position
    const position = { x: 300, y: 200 };
    this.diagramService.addBoundingBox(position);
  }

  addIncomingTendril(): void {
    const selectedNodeId = this.diagramService.currentState.selectedNodeId;
    if (selectedNodeId) {
      const node = this.diagramService.getNode(selectedNodeId);
      if (node) {
        // Count existing incoming tendrils
        const incomingCount = node.tendrils.filter(t => t.type === 'incoming').length;

        // Calculate vertical spacing for incoming tendrils along left edge
        const spacing = node.size.height / (incomingCount + 1);
        const y = spacing * (incomingCount + 0.5); // Center between existing tendrils

        const position = {
          x: 0,
          y: Math.max(10, Math.min(node.size.height - 10, y)) // Keep within node bounds
        };
        this.diagramService.addTendril(selectedNodeId, 'incoming', position);
      }
    }
  }

  addOutgoingTendril(): void {
    const selectedNodeId = this.diagramService.currentState.selectedNodeId;
    if (selectedNodeId) {
      const node = this.diagramService.getNode(selectedNodeId);
      if (node) {
        // Count existing outgoing tendrils
        const outgoingCount = node.tendrils.filter(t => t.type === 'outgoing').length;

        // Calculate vertical spacing for outgoing tendrils along right edge
        const spacing = node.size.height / (outgoingCount + 1);
        const y = spacing * (outgoingCount + 0.5); // Center between existing tendrils

        const position = {
          x: node.size.width,
          y: Math.max(10, Math.min(node.size.height - 10, y)) // Keep within node bounds
        };
        this.diagramService.addTendril(selectedNodeId, 'outgoing', position);
      }
    }
  }

  addIncomingTendrilToSvgImage(): void {
    const selectedSvgImageId = this.diagramService.currentState.selectedSvgImageId;
    if (selectedSvgImageId) {
      const svgImage = this.diagramService.getSvgImage(selectedSvgImageId);
      if (svgImage) {
        // Count existing incoming tendrils
        const incomingCount = svgImage.tendrils.filter(t => t.type === 'incoming').length;

        // Calculate vertical spacing for incoming tendrils along left edge
        const spacing = svgImage.size.height / (incomingCount + 1);
        const y = spacing * (incomingCount + 0.5); // Center between existing tendrils

        const position = {
          x: 0,
          y: Math.max(10, Math.min(svgImage.size.height - 10, y)) // Keep within SVG bounds
        };
        this.diagramService.addTendrilToSvgImage(selectedSvgImageId, 'incoming', position);
      }
    }
  }

  addOutgoingTendrilToSvgImage(): void {
    const selectedSvgImageId = this.diagramService.currentState.selectedSvgImageId;
    if (selectedSvgImageId) {
      const svgImage = this.diagramService.getSvgImage(selectedSvgImageId);
      if (svgImage) {
        // Count existing outgoing tendrils
        const outgoingCount = svgImage.tendrils.filter(t => t.type === 'outgoing').length;

        // Calculate vertical spacing for outgoing tendrils along right edge
        const spacing = svgImage.size.height / (outgoingCount + 1);
        const y = spacing * (outgoingCount + 0.5); // Center between existing tendrils

        const position = {
          x: svgImage.size.width,
          y: Math.max(10, Math.min(svgImage.size.height - 10, y)) // Keep within SVG bounds
        };
        this.diagramService.addTendrilToSvgImage(selectedSvgImageId, 'outgoing', position);
      }
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

  getSelectedNodeFillColor(): string {
    const selectedNodeId = this.selectedNodeId;
    if (selectedNodeId) {
      const node = this.diagramService.getNode(selectedNodeId);
      return node?.fillColor || '#ffffff';
    }
    return '#ffffff';
  }

  getSelectedNodeBorderColor(): string {
    const selectedNodeId = this.selectedNodeId;
    if (selectedNodeId) {
      const node = this.diagramService.getNode(selectedNodeId);
      return node?.borderColor || '#000000';
    }
    return '#000000';
  }

  updateNodeFillColor(event: Event): void {
    const selectedNodeId = this.selectedNodeId;
    if (selectedNodeId) {
      const target = event.target as HTMLInputElement;
      this.diagramService.updateNode(selectedNodeId, { fillColor: target.value });
    }
  }

  updateNodeBorderColor(event: Event): void {
    const selectedNodeId = this.selectedNodeId;
    if (selectedNodeId) {
      const target = event.target as HTMLInputElement;
      this.diagramService.updateNode(selectedNodeId, { borderColor: target.value });
    }
  }

  getSelectedNodeNotes(): string {
    const selectedNodeId = this.selectedNodeId;
    if (selectedNodeId) {
      const node = this.diagramService.getNode(selectedNodeId);
      return node?.notes || '';
    }
    return '';
  }

  updateNodeNotes(event: Event): void {
    const selectedNodeId = this.selectedNodeId;
    if (selectedNodeId) {
      const target = event.target as HTMLTextAreaElement;
      this.diagramService.updateNode(selectedNodeId, { notes: target.value });
    }
  }

  getSelectedNodeName(): string {
    const selectedNodeId = this.selectedNodeId;
    if (selectedNodeId) {
      const node = this.diagramService.getNode(selectedNodeId);
      return node?.name || '';
    }
    return '';
  }

  updateNodeName(event: Event): void {
    const selectedNodeId = this.selectedNodeId;
    if (selectedNodeId) {
      const target = event.target as HTMLInputElement;
      this.diagramService.updateNode(selectedNodeId, { name: target.value });
    }
  }

  getSelectedNodeShape(): string {
    const selectedNodeId = this.selectedNodeId;
    if (selectedNodeId) {
      const node = this.diagramService.getNode(selectedNodeId);
      return node?.shape || 'rectangle';
    }
    return 'rectangle';
  }

  setNodeShape(shape: string): void {
    const selectedNodeId = this.selectedNodeId;
    if (selectedNodeId) {
      this.diagramService.updateNode(selectedNodeId, { shape: shape as any });
    }
  }

  getSelectedTendrilName(): string {
    const selectedNodeId = this.selectedNodeId;
    const selectedTendrilId = this.selectedTendrilId;
    if (selectedNodeId && selectedTendrilId) {
      const tendril = this.diagramService.getTendril(selectedNodeId, selectedTendrilId);
      return tendril?.name || '';
    }
    return '';
  }

  getSelectedTendrilTypeLabel(): string {
    const selectedNodeId = this.selectedNodeId;
    const selectedTendrilId = this.selectedTendrilId;
    if (selectedNodeId && selectedTendrilId) {
      const tendril = this.diagramService.getTendril(selectedNodeId, selectedTendrilId);
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
      const tendril = this.diagramService.getTendril(selectedNodeId, selectedTendrilId);
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
    const selectedNodeId = this.selectedNodeId;
    const selectedTendrilId = this.selectedTendrilId;
    if (selectedNodeId && selectedTendrilId) {
      // Get current tendril to check if name needs updating
      const currentTendril = this.diagramService.getTendrilAny(selectedNodeId, selectedTendrilId);
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

      // Check if it's an SVG tendril (selectedNodeId starts with 'svg-')
      if (selectedNodeId.startsWith('svg-')) {
        const svgImageId = selectedNodeId.substring(4);
        this.diagramService.updateSvgTendril(svgImageId, selectedTendrilId, updates);
      } else {
        // Regular node tendril
        this.diagramService.updateTendril(selectedNodeId, selectedTendrilId, updates);
      }
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
}
