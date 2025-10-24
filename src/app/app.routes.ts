import { Routes } from '@angular/router';
import { VoiceAIAssistantComponent } from './shared/components/voice-ai-assistant/voice-ai-assistant.component';

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
    loadChildren: () => import('./features/admin/admin.module').then(m => m.AdminModule)
  },
  { 
    path: 'ai-assistant', 
    component: VoiceAIAssistantComponent 
  }
];