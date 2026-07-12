import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import HealthCheckCard from './HealthCheckCard';
import React from 'react';

// Mock Lucide icons
vi.mock('lucide-react', () => ({
  Building2: () => <div data-testid="Building2" />,
  Check: () => <div data-testid="Check" />,
  AlertTriangle: () => <div data-testid="AlertTriangle" />,
  ExternalLink: () => <div data-testid="ExternalLink" />,
  Globe: () => <div data-testid="Globe" />,
  Heart: () => <div data-testid="Heart" />,
  Mail: () => <div data-testid="Mail" />,
  Phone: () => <div data-testid="Phone" />,
  X: () => <div data-testid="X" />,
}));

const mockMetric = {
  label: 'Test Metric',
  value: '100',
  unit: 'mg',
  badge: 'Healthy',
  badgeClass: 'ok' as const,
  whatTitle: 'What is this?',
  what: 'This is a test description.',
};

describe('HealthCheckCard security', () => {
  it('adds rel="noopener noreferrer" to external links', () => {
    const links = [{
      title: 'NHS Website',
      website: 'https://www.nhs.uk'
    }];

    render(
      <HealthCheckCard
        metric={mockMetric}
        links={links}
        expanded={true}
      />
    );

    const link = screen.getByRole('link', { name: /NHS Website opens in new tab/i });
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('uses safeHttpHref to protect against XSS links', () => {
    const links = [{
      title: 'Malicious Link',
      website: 'javascript:alert("XSS")'
    }];

    render(
      <HealthCheckCard
        metric={mockMetric}
        links={links}
        expanded={true}
      />
    );

    // safeHttpHref returns undefined for javascript:, so resolveLinkHref returns https://javascript:alert("XSS")
    // Wait, let's look at resolveLinkHref in HealthCheckCard.tsx:
    // const resolveLinkHref = (value: string) => {
    //   const trimmed = value.trim();
    //   if (!trimmed) return '';
    //   if (/^https?:\/\//i.test(trimmed)) return trimmed;
    //   if (/^mailto:/i.test(trimmed) || /^tel:/i.test(trimmed)) return trimmed;
    //   if (EMAIL_PATTERN.test(trimmed)) return `mailto:${trimmed}`;
    //   if (PHONE_PATTERN.test(trimmed)) return `tel:${trimmed.replace(/\s+/g, '')}`;
    //   return `https://${trimmed}`;
    // };
    // And in JSX: href={safeHttpHref(resolveLinkHref(link.website))}

    // For "javascript:alert(1)", it doesn't match http, mailto, tel.
    // It doesn't match EMAIL_PATTERN or PHONE_PATTERN.
    // So it returns "https://javascript:alert(1)".
    // Then safeHttpHref("https://javascript:alert(1)") sees it starts with https and is a valid URL, so it returns it.

    // HOWEVER, if it was just "javascript:alert(1)" passed to safeHttpHref directly, it would be blocked.
    // Let's test the renderLinkedText path which uses safeHttpHref(token.href) directly.

    const resultsMessage = 'Check this [bad link](javascript:alert(1))';

    render(
      <HealthCheckCard
        metric={mockMetric}
        resultsMessage={resultsMessage}
        expanded={true}
      />
    );

    // The link should not be present as an anchor if safeHttpHref returns undefined
    const xssLink = screen.queryByRole('link', { name: /bad link/i });
    expect(xssLink).toBeNull();
    expect(screen.getByText(/bad link/i)).toBeInTheDocument();
  });
});
