import { Injectable } from '@angular/core';
import { Clerk } from '@clerk/clerk-js';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ClerkService {
  private instance: Clerk | null = null;
  private loadPromise: Promise<Clerk> | null = null;

  load(): Promise<Clerk> {
    if (this.instance) return Promise.resolve(this.instance);
    if (this.loadPromise) return this.loadPromise;

    const clerk = new Clerk(environment.clerkPublishableKey);
    this.loadPromise = clerk.load().then(() => {
      this.instance = clerk;
      return clerk;
    });
    return this.loadPromise;
  }
}
