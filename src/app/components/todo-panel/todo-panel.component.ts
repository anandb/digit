import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DiagramService } from '../../services/diagram.service';
import { Diagram, TodoItem } from '../../models/diagram.model';
import { map } from 'rxjs/operators';
import { Observable } from 'rxjs';

@Component({
    selector: 'app-todo-panel',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './todo-panel.component.html',
    styleUrls: ['./todo-panel.component.sass']
})
export class TodoPanelComponent implements OnInit {
    isOpen = false;
    newTodoText = '';
    todos$: Observable<TodoItem[]>;

    constructor(private diagramService: DiagramService) {
        this.todos$ = this.diagramService.state$.pipe(
            map(state => state.currentDiagram.todos || [])
        );
    }

    ngOnInit(): void { }

    togglePanel(): void {
        this.isOpen = !this.isOpen;
    }

    addTodo(): void {
        if (this.newTodoText.trim()) {
            this.diagramService.addTodo(this.newTodoText.trim());
            this.newTodoText = '';
        }
    }

    deleteTodo(id: string): void {
        this.diagramService.deleteTodo(id);
    }

    toggleTodo(id: string): void {
        this.diagramService.toggleTodo(id);
    }

    onKeydown(event: KeyboardEvent): void {
        if (event.key === 'Enter') {
            this.addTodo();
        }
    }
}
