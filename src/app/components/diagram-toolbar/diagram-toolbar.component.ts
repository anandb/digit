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
  constructor(private diagramService: DiagramService) {}

  addNewNode(): void {
    // Add node at a default position (center of visible area)
    const position = { x: 400, y: 300 };
    this.diagramService.addNode(position);
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

  get selectedTendrilId(): string | undefined {
    return this.diagramService.currentState.selectedTendrilId;
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
}
