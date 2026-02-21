import { Component, OnInit, HostListener, ViewChild } from '@angular/core';
import { DiagramCanvasComponent } from './components/diagram-canvas/diagram-canvas.component';
import { DiagramToolbarComponent } from './components/diagram-toolbar/diagram-toolbar.component';
import { TodoPanelComponent } from './components/todo-panel/todo-panel.component';
import { PropertiesWindowComponent } from './components/properties-window/properties-window.component';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, DiagramToolbarComponent, DiagramCanvasComponent, TodoPanelComponent, PropertiesWindowComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.sass'
})
export class AppComponent implements OnInit {
  title = 'digit';

  @ViewChild('toolbar') toolbar!: DiagramToolbarComponent;
  @ViewChild('propertiesWindow') propertiesWindow!: PropertiesWindowComponent;

  ngOnInit(): void {}
}
