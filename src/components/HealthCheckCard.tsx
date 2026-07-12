import React, { useState } from 'react';
import { Building2, Check, AlertTriangle, ExternalLink, Globe, Heart, Mail, Phone, X } from 'lucide-react';
import WarningCallout from './WarningCallout';
import InsetText from './InsetText';
import { safeHttpHref } from '../safeHref';

interface HealthCheckCardLink {
  title: string;
  phone?: string;
  phoneLabel?: string;
  email?: string;
  emailLabel?: string;
  website?: string;
  city?: string;
  county_area?: string;
}

interface HealthCheckCardMetric {
  label: string;
  value: string;
  unit?: string;
  badge: string;
  badgeClass: 'ok' | 'amber' | 'red';
  whatTitle: string;
  what: string;
  pathway?: string;
  breakdown?: { label: string; value: string; unit?: string }[];
  oneLiner?: string;
}

interface HealthCheckCardProps {
  metric: HealthCheckCardMetric;
  resultsMessage?: string;
  importantText?: string;
  nextStepsTitle?: string;
  nextStepsText?: string;
  links?: HealthCheckCardLink[];
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  collapsedPrompt?: string;
}

const URL_PATTERN = /(https?:\/\/[^\s]+)/g;
const MARKDOWN_LINK_PATTERN = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const PHONE_PATTERN = /^\+?[0-9()\-\s]{7,}$/;
const NHS_FAVICON_URL = '/pathway-icons/nhs-logo-small.jpg';

const resolveLinkHref = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^mailto:/i.test(trimmed) || /^tel:/i.test(trimmed)) return trimmed;
  if (EMAIL_PATTERN.test(trimmed)) return `mailto:${trimmed}`;
  if (PHONE_PATTERN.test(trimmed)) return `tel:${trimmed.replace(/\s+/g, '')}`;
  return `https://${trimmed}`;
};

const resolveEmailHref = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/^mailto:/i.test(trimmed)) return trimmed;
  return `mailto:${trimmed}`;
};

const faviconUrlForLink = (value: string) => {
  if (isNhsDomain(value)) return NHS_FAVICON_URL;
  const href = resolveLinkHref(value);
  try {
    const url = new URL(href);
    return `${url.origin}/favicon.ico`;
  } catch {
    return '';
  }
};

const hasContactValue = (link: HealthCheckCardLink) => Boolean(link.phone || link.email || link.website);

const isNhsDomain = (value: string) => {
  const href = resolveLinkHref(value);
  try {
    const url = new URL(href);
    const host = url.hostname.toLowerCase();
    return host === 'nhs.uk' || host.endsWith('.nhs.uk');
  } catch {
    return false;
  }
};

const isBhfDomain = (value: string) => {
  const href = resolveLinkHref(value);
  try {
    const url = new URL(href);
    const host = url.hostname.toLowerCase();
    return host === 'bhf.org.uk' || host.endsWith('.bhf.org.uk');
  } catch {
    return false;
  }
};

const renderLinkedText = (text: string) =>
  text.split('\n').map((line, lineIndex, lines) => {
    const tokens: Array<
      | { type: 'text'; value: string }
      | { type: 'url'; href: string; label: string }
    > = [];

    const combined = new RegExp(`${MARKDOWN_LINK_PATTERN.source}|${URL_PATTERN.source}`, 'g');
    let lastIndex = 0;
    let match: RegExpExecArray | null = null;

    while ((match = combined.exec(line)) !== null) {
      const matchIndex = match.index ?? 0;
      if (matchIndex > lastIndex) {
        tokens.push({ type: 'text', value: line.slice(lastIndex, matchIndex) });
      }

      const markdownLabel = match[1];
      const markdownHref = match[2];
      const rawUrl = match[3];

      if (markdownHref) {
        tokens.push({ type: 'url', href: markdownHref, label: (markdownLabel || '').trim() || markdownHref });
      } else if (rawUrl) {
        tokens.push({ type: 'url', href: rawUrl, label: rawUrl });
      }

      lastIndex = matchIndex + match[0].length;
    }

    if (lastIndex < line.length) {
      tokens.push({ type: 'text', value: line.slice(lastIndex) });
    }

    return (
      <React.Fragment key={`line-${lineIndex}`}>
        {tokens.map((token, tokenIndex) => {
          if (token.type === 'url') {
            const safeHref = safeHttpHref(token.href);
            if (!safeHref) return <React.Fragment key={`token-${lineIndex}-${tokenIndex}`}>{token.label}</React.Fragment>;
            return (
              <a
                key={`token-${lineIndex}-${tokenIndex}`}
                className="hc-inline-link"
                href={safeHref}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${token.label} opens in new tab`}
              >
                {token.label}
              </a>
            );
          }
          return <React.Fragment key={`token-${lineIndex}-${tokenIndex}`}>{token.value}</React.Fragment>;
        })}
        {lineIndex < lines.length - 1 ? <br /> : null}
      </React.Fragment>
    );
  });

const firstSentence = (value: string) => {
  const trimmed = (value || '').trim();
  if (!trimmed) return '';
  const match = trimmed.match(/^(.+?[.!?])(\s|$)/);
  return match ? match[1].trim() : trimmed;
};

const HealthCheckCard: React.FC<HealthCheckCardProps> = ({
  metric,
  resultsMessage,
  importantText,
  nextStepsTitle,
  nextStepsText,
  links = [],
  expanded,
  onExpandedChange,
  collapsedPrompt,
}) => {
  const [internalExpanded, setInternalExpanded] = useState(true);
  const renderedLinks = links.filter((link) => hasContactValue(link));
  const localLinks = renderedLinks.filter((link) => link.city || link.county_area);
  const nationalLinks = renderedLinks.filter((link) => !link.city && !link.county_area);
  // If a custom title is provided but cleared, treat that as "hide this whole section"
  // (mirrors the behaviour of the "what is" section, which requires a title).
  const nextStepsExplicitlyHidden = nextStepsTitle !== undefined && nextStepsTitle.trim() === '';
  const showNextSteps = !nextStepsExplicitlyHidden && Boolean((nextStepsText || '').trim() || renderedLinks.length > 0);
  const resolvedExpanded = expanded ?? internalExpanded;
  const setExpanded = onExpandedChange ?? setInternalExpanded;
  const collapsedSummary = firstSentence(metric.oneLiner || resultsMessage || metric.pathway || '');
  return (
    <article className={`hc-card hc-card--${metric.badgeClass}${resolvedExpanded ? '' : ' hc-card--collapsed'}`}>
      <div className="hc-card__header">
        <div className="hc-card__domain-row">
          <h3 className="hc-card__domain">{metric.label}</h3>
          <span className={`hc-card__status-pill hc-card__status-pill--${metric.badgeClass}`}>
            <span className="hc-card__status-pill-icon" aria-hidden="true">
              {metric.badgeClass === 'ok' ? <Check size={14} /> : metric.badgeClass === 'amber' ? <AlertTriangle size={14} /> : <X size={14} />}
            </span>
            {metric.badge}
          </span>
        </div>

        <div className="hc-card__header-left">
          <button
            type="button"
            className="hc-card__toggle"
            aria-expanded={resolvedExpanded}
            onClick={() => setExpanded(!resolvedExpanded)}
          >
            <div className="hc-card__value-row">
              <span className="hc-card__value">{metric.value || '—'}</span>
              {metric.unit ? <span className="hc-card__unit">{metric.unit}</span> : <span className="hc-card__unit hc-card__unit--empty">&nbsp;</span>}
            </div>

            {!resolvedExpanded && collapsedSummary ? (
              <div className="hc-card__collapsed-summary">{renderLinkedText(collapsedSummary)}</div>
            ) : null}
            {!resolvedExpanded && collapsedPrompt ? <div className="hc-card__collapsed-prompt">{collapsedPrompt}</div> : null}
          </button>

          {resolvedExpanded ? (
            <div className={`hc-card__results-message hc-card__results-message--${metric.badgeClass} hc-card__results-message--header`}>
              <InsetText>
                <strong className="hc-card__results-message-title">What does this result mean?</strong>
                <div className="hc-card__results-message-body">{renderLinkedText(resultsMessage || metric.pathway || '')}</div>
              </InsetText>
            </div>
          ) : null}
        </div>
      </div>

      <div className={`hc-card__details${resolvedExpanded ? ' hc-card__details--open' : ''}`}>
        <div className="hc-card__layout hc-card__layout--single">
          <div className="hc-card__left">
          {showNextSteps ? (
            <div className="hc-card__next-steps" aria-label="What to do next">
              {nextStepsText ? <div className="hc-card__next-steps-body">{renderLinkedText(nextStepsText)}</div> : null}
              {localLinks.length > 0 ? (
                <div style={{ marginBottom: '1rem' }}>
                  <div className="hc-card__next-steps-title" style={{ marginBottom: '0.75rem' }}>Local services available</div>
                  <div className="hc-card__links">
                    {(() => {
                      const nhsLinks = localLinks.filter((link) => link.website && isNhsDomain(link.website));
                      const supportLinks = localLinks.filter((link) => !link.website || !isNhsDomain(link.website));

                      const renderLinkCard = (link: HealthCheckCardLink, index: number, variant: 'nhs' | 'support') => {
                        const iconUrl = link.website ? faviconUrlForLink(link.website) : '';
                        const iconContent = (
                          <>
                            {iconUrl ? (
                              <img
                                className="hc-card__contact-icon"
                                src={iconUrl}
                                alt=""
                                aria-hidden="true"
                                onError={(event) => {
                                  event.currentTarget.style.display = 'none';
                                }}
                              />
                            ) : isBhfDomain(link.website || '') ? (
                              <Heart size={16} aria-hidden="true" />
                            ) : link.website ? (
                              <Globe size={16} aria-hidden="true" />
                            ) : (
                              <Building2 size={16} aria-hidden="true" />
                            )}
                          </>
                        );

                        return (
                        <div key={`local-${variant}-${link.title}-${index}`} className={`hc-card__contact${variant === 'nhs' ? ' hc-card__contact--nhs' : ''}`}>
                          <div className="hc-card__contact-icon-wrap">{iconContent}</div>
                          {link.website ? (
                            <a
                              className="hc-card__contact-title hc-card__contact-title-link"
                              href={safeHttpHref(resolveLinkHref(link.website))}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={link.website}
                              aria-label={`${link.title || 'More information'} opens in new tab`}
                            >
                              <span>{link.title || 'More information'}</span>
                              <ExternalLink size={14} aria-hidden="true" />
                            </a>
                          ) : link.title ? (
                            <div className="hc-card__contact-title"><span>{link.title}</span></div>
                          ) : null}
                          <div className="hc-card__contact-links">
                            {link.phone ? (
                              <a
                                className="hc-card__link"
                                href={resolveLinkHref(link.phone)}
                                aria-label={`${link.title || 'Service'} phone`}
                                title={link.phone}
                              >
                                <Phone size={14} aria-hidden="true" />
                                <span>{link.phoneLabel?.trim() || 'Call'}</span>
                              </a>
                            ) : null}
                            {link.email ? (
                              <a
                                className="hc-card__link"
                                href={resolveEmailHref(link.email)}
                                aria-label={`${link.title || 'Service'} email`}
                                title={link.email}
                              >
                                <Mail size={14} aria-hidden="true" />
                                <span>{link.emailLabel?.trim() || 'Email'}</span>
                              </a>
                            ) : null}
                          </div>
                        </div>
                        );
                      };

                      return (
                        <>
                          {supportLinks.map((link, index) => renderLinkCard(link, index, 'support'))}
                          {nhsLinks.length > 0 ? (
                            <>
                              {supportLinks.length > 0 ? <div className="hc-card__links-divider" aria-hidden="true" /> : null}
                              {nhsLinks.map((link, index) => renderLinkCard(link, index, 'nhs'))}
                            </>
                          ) : null}
                        </>
                      );
                    })()}
                  </div>
                </div>
              ) : null}
              {nationalLinks.length > 0 ? (
                <div>
                  <div className="hc-card__next-steps-title" style={{ marginBottom: '0.75rem' }}>Services available nationally</div>
                  <div className="hc-card__links">
                    {(() => {
                      const nhsLinks = nationalLinks.filter((link) => link.website && isNhsDomain(link.website));
                      const supportLinks = nationalLinks.filter((link) => !link.website || !isNhsDomain(link.website));

                      const renderLinkCard = (link: HealthCheckCardLink, index: number, variant: 'nhs' | 'support') => {
                        const iconUrl = link.website ? faviconUrlForLink(link.website) : '';
                        const iconContent = (
                          <>
                            {iconUrl ? (
                              <img
                                className="hc-card__contact-icon"
                                src={iconUrl}
                                alt=""
                                aria-hidden="true"
                                onError={(event) => {
                                  event.currentTarget.style.display = 'none';
                                }}
                              />
                            ) : isBhfDomain(link.website || '') ? (
                              <Heart size={16} aria-hidden="true" />
                            ) : link.website ? (
                              <Globe size={16} aria-hidden="true" />
                            ) : (
                              <Building2 size={16} aria-hidden="true" />
                            )}
                          </>
                        );

                        return (
                        <div key={`national-${variant}-${link.title}-${index}`} className={`hc-card__contact${variant === 'nhs' ? ' hc-card__contact--nhs' : ''}`}>
                          <div className="hc-card__contact-icon-wrap">{iconContent}</div>
                          {link.website ? (
                            <a
                              className="hc-card__contact-title hc-card__contact-title-link"
                              href={safeHttpHref(resolveLinkHref(link.website))}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={link.website}
                              aria-label={`${link.title || 'More information'} opens in new tab`}
                            >
                              <span>{link.title || 'More information'}</span>
                              <ExternalLink size={14} aria-hidden="true" />
                            </a>
                          ) : link.title ? (
                            <div className="hc-card__contact-title"><span>{link.title}</span></div>
                          ) : null}
                          <div className="hc-card__contact-links">
                            {link.phone ? (
                              <a
                                className="hc-card__link"
                                href={resolveLinkHref(link.phone)}
                                aria-label={`${link.title || 'Service'} phone`}
                                title={link.phone}
                              >
                                <Phone size={14} aria-hidden="true" />
                                <span>{link.phoneLabel?.trim() || 'Call'}</span>
                              </a>
                            ) : null}
                            {link.email ? (
                              <a
                                className="hc-card__link"
                                href={resolveEmailHref(link.email)}
                                aria-label={`${link.title || 'Service'} email`}
                                title={link.email}
                              >
                                <Mail size={14} aria-hidden="true" />
                                <span>{link.emailLabel?.trim() || 'Email'}</span>
                              </a>
                            ) : null}
                          </div>
                        </div>
                        );
                      };

                      return (
                        <>
                          {supportLinks.map((link, index) => renderLinkCard(link, index, 'support'))}
                          {nhsLinks.length > 0 ? (
                            <>
                              {supportLinks.length > 0 ? <div className="hc-card__links-divider" aria-hidden="true" /> : null}
                              {nhsLinks.map((link, index) => renderLinkCard(link, index, 'nhs'))}
                            </>
                          ) : null}
                        </>
                      );
                    })()}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {metric.breakdown && metric.breakdown.length > 0 ? (
            <div className="hc-card__breakdown" aria-label="Result breakdown">
              {metric.breakdown
                .filter((item) => (item.value || '').trim())
                .map((item) => (
                  <div key={item.label} className="hc-card__breakdown-item">
                    <span className="hc-card__breakdown-label">{item.label}</span>
                    <span className="hc-card__breakdown-value">
                      {item.value}
                      {item.unit ? ` ${item.unit}` : ''}
                    </span>
                  </div>
                ))}
            </div>
          ) : null}

          {metric.oneLiner ? <div className="hc-card__one-liner">{renderLinkedText(metric.oneLiner)}</div> : null}

          {importantText ? (
            <div className="hc-card__important-wrap">
              <WarningCallout title="Important">
                {renderLinkedText(importantText)}
              </WarningCallout>
            </div>
          ) : null}

          {metric.whatTitle && metric.what ? (
            <details className="hc-card__what-is">
              <summary className="hc-card__what-is-summary">{metric.whatTitle}</summary>
              <div className="hc-card__what-is-body">{renderLinkedText(metric.what)}</div>
            </details>
          ) : metric.whatTitle ? (
            <div className="hc-card__what-is hc-card__what-is--no-body">
              <span className="hc-card__what-is-summary">{metric.whatTitle}</span>
            </div>
          ) : null}
          </div>
        </div>
      </div>
    </article>
  );
};

export default HealthCheckCard;
