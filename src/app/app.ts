import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { ToolbarComponent } from './features/editor/toolbar/toolbar.component';
import { CanvasComponent } from './features/editor/canvas/canvas.component';
import { InspectorComponent } from './features/editor/inspector/inspector.component';
import { ModalHostComponent } from './shared/modal/modal-host.component';
import { AuthModalComponent } from './features/auth/auth-modal.component';
import { AuthService } from './core/services/auth.service';

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
export class App implements OnInit {
  private readonly auth = inject(AuthService);

  ngOnInit(): void {
    const url = new URL(window.location.href);
    const clerkKeys = Array.from(url.searchParams.keys()).filter((k) => k.startsWith('__clerk_'));
    if (clerkKeys.length === 0 && !url.hash.includes('__clerk_')) return;

    this.auth.handleRedirectCallback().finally(() => {
      clerkKeys.forEach((k) => url.searchParams.delete(k));
      window.history.replaceState({}, '', url.pathname + (url.search || '') + '');
    });
  }
}
