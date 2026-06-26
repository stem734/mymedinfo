import React from 'react';
import { AlertCircle } from 'lucide-react';
import Modal from './Modal';

type ConfirmDialogProps = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDangerous?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  isDangerous = false,
  onConfirm,
  onCancel,
}) => {
  return (
    <Modal
      isOpen
      onClose={onCancel}
      size="sm"
      title={title}
      icon={<AlertCircle size={24} color={isDangerous ? 'var(--nhs-red)' : 'var(--nhs-blue)'} aria-hidden="true" />}
      overlayClassName="ui-modal__overlay--dialog"
      bodyClassName="confirm-dialog__body"
      footer={(
        <>
          <button onClick={onCancel} className="action-button" style={{ backgroundColor: '#4c6272' }}>
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className="action-button"
            style={{ backgroundColor: isDangerous ? 'var(--nhs-red)' : 'var(--nhs-blue)' }}
          >
            {confirmLabel}
          </button>
        </>
      )}
    >
      <p className="confirm-dialog__message">{message}</p>
    </Modal>
  );
};

export default ConfirmDialog;
