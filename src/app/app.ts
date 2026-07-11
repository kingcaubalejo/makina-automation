import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ToolbarComponent } from './features/editor/toolbar/toolbar.component';
import { CanvasComponent } from './features/editor/canvas/canvas.component';
import { InspectorComponent } from './features/editor/inspector/inspector.component';
import { ModalHostComponent } from './shared/modal/modal-host.component';
import { AuthModalComponent } from './features/auth/auth-modal.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    ToolbarComponent,
    CanvasComponent,
    InspectorComponent,
    ModalHostComponent,
    AuthModalComponent,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {}
