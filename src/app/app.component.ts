import { Component } from '@angular/core';
import { DiagramCanvasComponent } from './components/diagram-canvas/diagram-canvas.component';
import { DiagramToolbarComponent } from './components/diagram-toolbar/diagram-toolbar.component';

@Component({
  selector: 'app-root',
  imports: [DiagramCanvasComponent, DiagramToolbarComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.sass'
})
export class AppComponent {
  title = 'digit';
}
