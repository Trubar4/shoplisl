import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-debug-user',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div style="padding: 20px; font-family: monospace;">
      <h1>Debug: User Info</h1>

      <div *ngIf="user; else notLoggedIn">
        <h2>✅ You are logged in</h2>
        <table border="1" cellpadding="10">
          <tr>
            <td><strong>User ID:</strong></td>
            <td>{{ user.id }}</td>
          </tr>
          <tr>
            <td><strong>Email:</strong></td>
            <td>{{ user.email }}</td>
          </tr>
          <tr>
            <td><strong>Name:</strong></td>
            <td>{{ user.name }}</td>
          </tr>
          <tr>
            <td><strong>Admin User ID:</strong></td>
            <td>HYqET9vr40eDju4nQCTnJTV0qJo2</td>
          </tr>
          <tr>
            <td><strong>Match?</strong></td>
            <td>{{ user.id === 'HYqET9vr40eDju4nQCTnJTV0qJo2' ? '✅ YES - Admin access should work' : '❌ NO - Admin access denied' }}</td>
          </tr>
        </table>
      </div>

      <ng-template #notLoggedIn>
        <h2>❌ You are NOT logged in</h2>
        <p>Please log in first, then visit this page again.</p>
      </ng-template>
    </div>
  `
})
export class DebugUserComponent implements OnInit {
  user: any = null;

  constructor(private authService: AuthService) {}

  ngOnInit() {
    this.authService.getCurrentUser().subscribe(user => {
      this.user = user;
      console.log('Debug - Current user:', user);
    });
  }
}
