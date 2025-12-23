import { Component, OnInit, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { getHelpTopic, HelpTopic } from '../help-content';

@Component({
  selector: 'app-help-detail',
  imports: [
    CommonModule,
    MatToolbarModule,
    MatIconModule,
    MatButtonModule
  ],
  templateUrl: './help-detail.component.html',
  styleUrls: ['./help-detail.component.scss']
})
export class HelpDetailComponent implements OnInit, AfterViewInit {
  @ViewChild('carousel') carousel!: ElementRef<HTMLDivElement>;

  topic: HelpTopic | undefined;
  currentStep = 0;
  fullscreenImage: string | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    const topicId = this.route.snapshot.paramMap.get('id');
    if (topicId) {
      this.topic = getHelpTopic(topicId);
      if (!this.topic) {
        // Topic not found, navigate back
        this.router.navigate(['/help']);
      }
    }
  }

  ngAfterViewInit(): void {
    // Listen to scroll events to update current step indicator
    if (this.carousel) {
      this.carousel.nativeElement.addEventListener('scroll', () => {
        this.updateCurrentStep();
      });
    }
  }

  updateCurrentStep(): void {
    if (!this.carousel || !this.topic) return;

    const scrollLeft = this.carousel.nativeElement.scrollLeft;
    const width = this.carousel.nativeElement.offsetWidth;
    const newStep = Math.round(scrollLeft / width);

    if (newStep !== this.currentStep) {
      this.currentStep = newStep;
    }
  }

  onBack(): void {
    this.router.navigate(['/help']);
  }

  goToStep(index: number): void {
    if (!this.carousel) return;

    const width = this.carousel.nativeElement.offsetWidth;
    this.carousel.nativeElement.scrollTo({
      left: width * index,
      behavior: 'smooth'
    });
  }

  onImageError(event: Event): void {
    // Handle missing images gracefully
    const img = event.target as HTMLImageElement;
    img.style.display = 'none';
  }

  openFullscreen(imagePath: string): void {
    this.fullscreenImage = imagePath;
  }

  closeFullscreen(): void {
    this.fullscreenImage = null;
  }
}
