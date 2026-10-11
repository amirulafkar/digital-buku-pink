import { AfterViewInit, Directive, ElementRef, inject } from '@angular/core';

/** Moves focus to the page heading when a screen appears, so a screen reader announces the new page (WCAG 2.4.3). */
@Directive({ selector: 'h1[pageHeading]', host: { tabindex: '-1' } })
export class PageHeading implements AfterViewInit {
  private el = inject<ElementRef<HTMLElement>>(ElementRef);
  ngAfterViewInit(): void { this.el.nativeElement.focus({ preventScroll: true }); }
}
