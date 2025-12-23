import { Routes } from '@angular/router';
import { VoiceAIAssistantComponent } from './shared/components/voice-ai-assistant/voice-ai-assistant.component';
import { adminGuard } from './core/guards/admin.guard';

export const routes: Routes = [
  {
    path: '',
    redirectTo: '/lists',
    pathMatch: 'full'
  },
  {
    path: 'lists',
    loadChildren: () => import('./features/lists/lists.module').then(m => m.ListsModule)
  },
  {
    path: 'articles',
    loadChildren: () => import('./features/articles/articles.module').then(m => m.ArticlesModule)
  },
  {
    path: 'admin',
    canActivate: [adminGuard],
    loadChildren: () => import('./features/admin/admin.module').then(m => m.AdminModule)
  },
  {
    path: 'ai-assistant',
    component: VoiceAIAssistantComponent
  },
  // Phase 8: Share invite acceptance route
  {
    path: 'invite/:token',
    loadComponent: () => import('./features/lists/accept-invite/accept-invite.component').then(m => m.AcceptInviteComponent),
    runGuardsAndResolvers: 'always' // Always re-run component even on same URL navigation
  },
  // Help / Tips routes
  {
    path: 'help',
    loadComponent: () => import('./features/help/help-overview/help-overview.component').then(m => m.HelpOverviewComponent)
  },
  {
    path: 'help/:id',
    loadComponent: () => import('./features/help/help-detail/help-detail.component').then(m => m.HelpDetailComponent)
  }
];