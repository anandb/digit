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

  constructor(private diagramService: DiagramService) {
    // Load saved sidebar state
    this.loadSidebarState();
  }

  newDiagram(): void {
    // Clear session storage
    if (typeof window !== 'undefined' && window.sessionStorage) {
      sessionStorage.removeItem('diagram-app-data');
    }

    // Reset the diagram service state
    this.diagramService['stateSubject'].next({
      currentDiagram: this.diagramService['createEmptyDiagram'](),
      diagramStack: [],
      selectedNodeId: undefined,
      selectedTendrilId: undefined
    });
  }

  addNewNode(): void {
    // Add node at a default position (center of visible area)
    const position = { x: 400, y: 300 };
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
