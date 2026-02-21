import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PropertiesWindowComponent } from './properties-window.component';

describe('PropertiesWindowComponent', () => {
  let component: PropertiesWindowComponent;
  let fixture: ComponentFixture<PropertiesWindowComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PropertiesWindowComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PropertiesWindowComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
