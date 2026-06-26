import React from 'react';
import { X } from 'lucide-react';

type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

type ModalProps = {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  footer?: React.ReactNode;
  size?: ModalSize;
  overlayClassName?: string;
  panelClassName?: string;
  bodyClassName?: string;
  closeButtonLabel?: string;
  ariaLabelledBy?: string;
  closeOnOverlayClick?: boolean;
};

const sizeClassName: Record<ModalSize, string> = {
  sm: 'ui-modal__panel--sm',
  md: 'ui-modal__panel--md',
  lg: 'ui-modal__panel--lg',
  xl: 'ui-modal__panel--xl',
};

const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  children,
  title,
  subtitle,
  icon,
  actions,
  footer,
  size = 'md',
  overlayClassName = '',
  panelClassName = '',
  bodyClassName = '',
  closeButtonLabel = 'Close dialog',
  ariaLabelledBy,
  closeOnOverlayClick = true,
}) => {
  if (!isOpen) {
    return null;
  }

  const hasHeader = Boolean(title || subtitle || icon || actions);

  return (
    <div className={`ui-modal__overlay ${overlayClassName}`.trim()} onClick={closeOnOverlayClick ? onClose : undefined}>
      <div
        className={`ui-modal__panel ${sizeClassName[size]} ${panelClassName}`.trim()}
        onClick={(event) => event.stopPropagation()}
      >
        {hasHeader && (
          <div className="ui-modal__header">
            <div className="ui-modal__header-copy">
              {icon && <div className="ui-modal__header-icon">{icon}</div>}
              <div>
                {title && (
                  <h2 id={ariaLabelledBy} className="ui-modal__title">
                    {title}
                  </h2>
                )}
                {subtitle && <p className="ui-modal__subtitle">{subtitle}</p>}
              </div>
            </div>
            <div className="ui-modal__header-actions">
              {actions}
              <button type="button" onClick={onClose} className="ui-modal__close-button" aria-label={closeButtonLabel}>
                <X size={20} />
              </button>
            </div>
          </div>
        )}

        <div className={`ui-modal__body ${bodyClassName}`.trim()}>{children}</div>

        {footer && <div className="ui-modal__footer">{footer}</div>}
      </div>
    </div>
  );
};

export default Modal;
