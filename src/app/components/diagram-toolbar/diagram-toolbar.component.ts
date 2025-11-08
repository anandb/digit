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
      // Add tendril at the left side of the node
      const node = this.diagramService.getNode(selectedNodeId);
      if (node) {
        const position = {
          x: 0,
          y: node.size.height / 2
        };
        this.diagramService.addTendril(selectedNodeId, 'incoming', position);
      }
    }
  }

  addOutgoingTendril(): void {
    const selectedNodeId = this.diagramService.currentState.selectedNodeId;
    if (selectedNodeId) {
      // Add tendril at the right side of the node
      const node = this.diagramService.getNode(selectedNodeId);
      if (node) {
        const position = {
          x: node.size.width,
          y: node.size.height / 2
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
}
