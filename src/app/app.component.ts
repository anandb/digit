import { Component, OnInit, HostListener, ElementRef, ViewChild } from '@angular/core';
import { DiagramCanvasComponent } from './components/diagram-canvas/diagram-canvas.component';
import { DiagramToolbarComponent } from './components/diagram-toolbar/diagram-toolbar.component';

@Component({
  selector: 'app-root',
  imports: [DiagramCanvasComponent, DiagramToolbarComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.sass'
})
export class AppComponent implements OnInit {
  title = 'digit';

  @ViewChild('toolbar') toolbar!: DiagramToolbarComponent;

  private isResizing = false;
  private startX = 0;
  private startWidth = 380;
  private minWidth = 200;
  private maxWidth = 800;

  ngOnInit(): void {
    // Load saved sidebar width
    this.loadSidebarWidth();
  }

  startResizing(event: MouseEvent): void {
    this.isResizing = true;
    this.startX = event.clientX;
    this.startWidth = this.getCurrentSidebarWidth();

    // Prevent text selection during resize
    event.preventDefault();
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'ew-resize';
  }

  @HostListener('document:mousemove', ['$event'])
  onMouseMove(event: MouseEvent): void {
    if (this.isResizing) {
      const deltaX = event.clientX - this.startX;
      const newWidth = Math.max(this.minWidth, Math.min(this.maxWidth, this.startWidth + deltaX));

      this.updateSidebarWidth(newWidth);
    }
  }

  @HostListener('document:mouseup', ['$event'])
  onMouseUp(event: MouseEvent): void {
    if (this.isResizing) {
      this.isResizing = false;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';

      // Save the final width
      this.saveSidebarWidth();
    }
  }

  private getCurrentSidebarWidth(): number {
    // Get the current width from the toolbar component or default
    return this.toolbar?.sidebarWidth || 380;
  }

  private updateSidebarWidth(width: number): void {
    if (this.toolbar) {
      this.toolbar.sidebarWidth = width;
      this.toolbar.updateMainContentMargin();
      this.updateResizeHandlePosition(width);
      this.updateMainContentMargin(width);
    }
  }

  private updateResizeHandlePosition(width: number): void {
    const resizeHandle = document.querySelector('.resize-handle') as HTMLElement;
    if (resizeHandle) {
      // When collapsed, position at 50px, otherwise use the current width
      const handlePosition = this.toolbar?.isCollapsed ? 50 : width;
      resizeHandle.style.left = `${handlePosition}px`;
    }
  }

  private updateMainContentMargin(width: number): void {
    const mainContent = document.querySelector('.main-content') as HTMLElement;
    if (mainContent) {
      // When collapsed, use 50px margin, otherwise use the current width
      const marginLeft = this.toolbar?.isCollapsed ? 50 : width;
      mainContent.style.marginLeft = `${marginLeft}px`;
    }
  }

  private loadSidebarWidth(): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = localStorage.getItem('diagram-sidebar-width');
      if (saved) {
        try {
          const width = parseInt(saved, 10);
          if (width >= this.minWidth && width <= this.maxWidth) {
            // Defer setting width until toolbar is available
            setTimeout(() => {
              if (this.toolbar) {
                this.toolbar.sidebarWidth = width;
                this.toolbar.updateMainContentMargin();
                this.updateResizeHandlePosition(width);
                this.updateMainContentMargin(width);
              }
            }, 100);
          }
        } catch (error) {
          console.warn('Failed to load sidebar width:', error);
        }
      }
    }
  }

  private saveSidebarWidth(): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const width = this.getCurrentSidebarWidth();
        localStorage.setItem('diagram-sidebar-width', width.toString());
      } catch (error) {
        console.warn('Failed to save sidebar width:', error);
      }
    }
  }
}
