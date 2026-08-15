import { ChangeDetectionStrategy, Component, OnInit, effect, inject } from '@angular/core';
import { ToolbarComponent } from './features/editor/toolbar/toolbar.component';
import { CanvasComponent } from './features/editor/canvas/canvas.component';
import { InspectorComponent } from './features/editor/inspector/inspector.component';
import { ModalHostComponent } from './shared/modal/modal-host.component';
import { AuthModalComponent } from './features/auth/auth-modal.component';
import { AuthService } from './core/services/auth.service';
import { WorkspaceService } from './core/services/workspace.service';

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
  protected readonly auth = inject(AuthService);
  protected readonly workspaces = inject(WorkspaceService);

  private bootedAs: 'cloud' | 'local' | null = null;

  constructor() {
    effect(() => {
      // Boot into a workspace as soon as auth has resolved. Signed-in users
      // get cloud workspaces (with a local fallback if they have none);
      // signed-out users get a local-only workspace. Never gate the canvas
      // behind sign-in or workspace creation.
      const ready = this.auth.ready();
      if (!ready) return;
      const desired = this.auth.isAuthenticated() ? 'cloud' : 'local';
      if (this.bootedAs === desired) return;
      this.bootedAs = desired;
      const boot = desired === 'cloud'
        ? this.workspaces.bootFromUrl()
        : this.workspaces.openLocalWorkspace();
      boot.catch((err) => {
        // eslint-disable-next-line no-console
        console.error('Boot failed', err);
      });
    });
  }

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
