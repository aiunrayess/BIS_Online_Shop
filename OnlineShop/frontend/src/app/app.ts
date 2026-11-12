import { Component, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HeaderComponent } from './components/header/header';
import { FooterComponent } from './components/footer/footer';
import { AuthService } from './services/auth.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, HeaderComponent, FooterComponent],
  template: `
    <app-header></app-header>
    <main>
      <router-outlet></router-outlet>
    </main>
    <app-footer></app-footer>
  `,
  styles: [`
    main {
      min-height: 80vh;
    }
  `]
})
export class AppComponent implements OnInit {
  constructor(private readonly auth: AuthService) {}

  ngOnInit(): void {
    // Restore the verified profile once so navigation and role-aware links do not rely on stale storage.
    this.auth.restoreSession().subscribe();
  }
}
