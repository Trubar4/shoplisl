// src/app/core/services/article-upload.component.ts
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ArticleUploadService } from './article-upload.service';

@Component({
  selector: 'app-article-upload',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatProgressSpinnerModule
  ],
  template: `
    <div class="upload-container">
      <h2>Artikel Upload</h2>
      <p>Hier können Sie alle 211 Artikel auf einmal in Firebase hochladen.</p>
      
      <button 
        mat-raised-button 
        color="primary"
        [disabled]="isUploading"
        (click)="uploadArticles()">
        <mat-spinner *ngIf="isUploading" diameter="20" style="margin-right: 10px;"></mat-spinner>
        {{ isUploading ? 'Wird hochgeladen...' : 'Artikel hochladen' }}
      </button>
      
      <div *ngIf="uploadStatus" class="status-message">
        {{ uploadStatus }}
      </div>
    </div>
  `,
  styles: [`
    .upload-container {
      padding: 20px;
      max-width: 500px;
      margin: 0 auto;
    }
    
    .status-message {
      margin-top: 20px;
      padding: 10px;
      background-color: #f5f5f5;
      border-radius: 4px;
      font-family: monospace;
      white-space: pre-line;
    }
  `]
})
export class ArticleUploadComponent {
  isUploading = false;
  uploadStatus = '';

  constructor(
    private articleUploadService: ArticleUploadService,
    private snackBar: MatSnackBar
  ) {}

  async uploadArticles(): Promise<void> {
    this.isUploading = true;
    this.uploadStatus = 'Upload gestartet...';

    try {
      await this.articleUploadService.uploadArticles();
      this.uploadStatus = 'Alle 211 Artikel erfolgreich hochgeladen! ✅';
      this.snackBar.open('Upload erfolgreich!', 'OK', { duration: 3000 });
    } catch (error) {
      this.uploadStatus = `Fehler beim Upload: ${error}`;
      this.snackBar.open('Upload fehlgeschlagen!', 'OK', { 
        duration: 5000
      });
    } finally {
      this.isUploading = false;
    }
  }
}