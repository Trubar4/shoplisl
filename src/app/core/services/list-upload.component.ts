// src/app/core/services/list-upload.component.ts
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ListUploadService } from './list-upload.service';

@Component({
  selector: 'app-list-upload',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatProgressSpinnerModule
  ],
  template: `
    <div class="upload-container">
      <h2>Listen Upload</h2>
      <p>Hier können Sie vordefinierte Listen mit allen zugehörigen Artikeln erstellen.</p>
      <p><strong>Was passiert:</strong></p>
      <ul>
        <li>🔍 Alle Artikel werden mit der Datenbank abgeglichen</li>
        <li>✅ Gefundene Artikel werden als "erledigt" markiert (durchgestrichen)</li>
        <li>📝 Nicht gefundene Artikel werden in der Konsole protokolliert</li>
      </ul>
      
      <div class="button-group">
        <button 
          mat-raised-button 
          color="warn"
          [disabled]="isUploading"
          (click)="createSparList()">
          <mat-spinner *ngIf="isUploading && currentList === 'spar'" diameter="20" style="margin-right: 10px;"></mat-spinner>
          🏪 {{ isUploading && currentList === 'spar' ? 'Wird erstellt...' : 'Spar Liste erstellen' }}
        </button>
        
        <button 
          mat-raised-button 
          style="background-color: #e91e63; color: white;"
          [disabled]="isUploading"
          (click)="createSutterluettyList()">
          <mat-spinner *ngIf="isUploading && currentList === 'sutterluetty'" diameter="20" style="margin-right: 10px;"></mat-spinner>
          🛍️ {{ isUploading && currentList === 'sutterluetty' ? 'Wird erstellt...' : 'Sutterlütty Liste erstellen' }}
        </button>
      </div>
      
      <div *ngIf="uploadStatus" class="status-message">
        {{ uploadStatus }}
      </div>
      
      <div class="info-box">
        <h3>💡 Tipp:</h3>
        <p>Öffnen Sie die Browser-Konsole (F12), um detaillierte Informationen über den Abgleich zu sehen.</p>
      </div>
      
      <div class="list-info">
        <h3>📋 Verfügbare Listen:</h3>
        <div class="list-cards">
          <div class="list-card spar">
            <h4>🏪 Spar</h4>
            <p><strong>Farbe:</strong> Rot</p>
            <p><strong>Artikel:</strong> ~200 Artikel</p>
            <p>Umfassende Einkaufsliste für den Supermarkt</p>
          </div>
          
          <div class="list-card sutterluetty">
            <h4>🛍️ Sutterlütty</h4>
            <p><strong>Farbe:</strong> Pink</p>
            <p><strong>Artikel:</strong> ~150 Artikel</p>
            <p>Spezialisierte Liste mit besonderen Produkten</p>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .upload-container {
      padding: 20px;
      max-width: 800px;
      margin: 0 auto;
    }
    
    .button-group {
      display: flex;
      gap: 15px;
      margin: 20px 0;
      flex-wrap: wrap;
    }
    
    .button-group button {
      flex: 1;
      min-width: 200px;
      padding: 12px 20px;
      font-size: 16px;
    }
    
    .status-message {
      margin-top: 20px;
      padding: 15px;
      background-color: #f5f5f5;
      border-radius: 4px;
      font-family: monospace;
      white-space: pre-line;
      border-left: 4px solid #4caf50;
    }
    
    .info-box {
      margin-top: 20px;
      padding: 15px;
      background-color: #e3f2fd;
      border-radius: 4px;
      border-left: 4px solid #2196f3;
    }
    
    .info-box h3 {
      margin-top: 0;
      color: #1976d2;
    }
    
    .list-info {
      margin-top: 30px;
      padding: 20px;
      background-color: #fafafa;
      border-radius: 8px;
    }
    
    .list-cards {
      display: flex;
      gap: 20px;
      margin-top: 15px;
      flex-wrap: wrap;
    }
    
    .list-card {
      flex: 1;
      min-width: 250px;
      padding: 15px;
      border-radius: 8px;
      border: 2px solid transparent;
    }
    
    .list-card.spar {
      background-color: #ffebee;
      border-color: #f44336;
    }
    
    .list-card.sutterluetty {
      background-color: #fce4ec;
      border-color: #e91e63;
    }
    
    .list-card h4 {
      margin-top: 0;
      font-size: 18px;
    }
    
    .list-card p {
      margin: 8px 0;
      font-size: 14px;
    }
    
    ul {
      margin: 10px 0;
      padding-left: 20px;
    }
    
    li {
      margin: 5px 0;
    }
  `]
})
export class ListUploadComponent {
  isUploading = false;
  uploadStatus = '';
  currentList = '';

  constructor(
    private listUploadService: ListUploadService,
    private snackBar: MatSnackBar
  ) {}

  async createSparList(): Promise<void> {
    this.isUploading = true;
    this.currentList = 'spar';
    this.uploadStatus = '🏪 Spar-Liste wird erstellt...';

    try {
      await this.listUploadService.createSparListWithArticles();
      this.uploadStatus = '🏪 Spar-Liste erfolgreich erstellt! ✅\n\nÖffnen Sie die Konsole für Details zum Artikel-Abgleich.';
      this.snackBar.open('Spar-Liste erfolgreich erstellt!', 'OK', { duration: 3000 });
    } catch (error) {
      this.uploadStatus = `❌ Fehler beim Erstellen der Spar-Liste: ${error}`;
      this.snackBar.open('Fehler beim Erstellen der Spar-Liste!', 'OK', { 
        duration: 5000
      });
    } finally {
      this.isUploading = false;
      this.currentList = '';
    }
  }

  async createSutterluettyList(): Promise<void> {
    this.isUploading = true;
    this.currentList = 'sutterluetty';
    this.uploadStatus = '🛍️ Sutterlütty-Liste wird erstellt...';

    try {
      await this.listUploadService.createSutterluettyListWithArticles();
      this.uploadStatus = '🛍️ Sutterlütty-Liste erfolgreich erstellt! ✅\n\nÖffnen Sie die Konsole für Details zum Artikel-Abgleich.';
      this.snackBar.open('Sutterlütty-Liste erfolgreich erstellt!', 'OK', { duration: 3000 });
    } catch (error) {
      this.uploadStatus = `❌ Fehler beim Erstellen der Sutterlütty-Liste: ${error}`;
      this.snackBar.open('Fehler beim Erstellen der Sutterlütty-Liste!', 'OK', { 
        duration: 5000
      });
    } finally {
      this.isUploading = false;
      this.currentList = '';
    }
  }
}