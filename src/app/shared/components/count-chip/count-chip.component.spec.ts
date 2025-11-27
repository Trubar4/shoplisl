import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CountChipComponent } from './count-chip.component';

describe('CountChipComponent', () => {
  let component: CountChipComponent;
  let fixture: ComponentFixture<CountChipComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CountChipComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(CountChipComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display count with # prefix', () => {
    component.count = 42;
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const chip = compiled.querySelector('.count-chip');
    expect(chip?.textContent?.trim()).toBe('#42');
  });

  it('should not display when count is 0', () => {
    component.count = 0;
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const chip = compiled.querySelector('.count-chip');
    expect(chip).toBeNull();
  });

  it('should not display when count is negative', () => {
    component.count = -5;
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const chip = compiled.querySelector('.count-chip');
    expect(chip).toBeNull();
  });

  it('should update display when count changes', () => {
    component.count = 10;
    fixture.detectChanges();

    let compiled = fixture.nativeElement as HTMLElement;
    let chip = compiled.querySelector('.count-chip');
    expect(chip?.textContent?.trim()).toBe('#10');

    component.count = 99;
    fixture.detectChanges();

    compiled = fixture.nativeElement as HTMLElement;
    chip = compiled.querySelector('.count-chip');
    expect(chip?.textContent?.trim()).toBe('#99');
  });
});
