import React, { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import Modal from './Modal';

type DisclaimerDialogProps = {
  title: string;
  message: string;
  checkboxLabel: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

const DisclaimerDialog: React.FC<DisclaimerDialogProps> = ({
  title,
  message,
  checkboxLabel,
  confirmLabel = 'Confirm',
  onConfirm,
  onCancel,
}) => {
  const [accepted, setAccepted] = useState(false);

  return (
    <Modal
      isOpen
      onClose={onCancel}
      size="md"
      title={title}
      icon={<AlertTriangle size={24} color="#d46b08" aria-hidden="true" />}
      overlayClassName="ui-modal__overlay--dialog"
      bodyClassName="disclaimer-dialog__body"
      footer={(
        <>
          <button onClick={onCancel} className="action-button" style={{ backgroundColor: '#4c6272' }}>
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!accepted}
            className="action-button"
            style={{
              backgroundColor: accepted ? '#d46b08' : '#d8dde0',
              cursor: accepted ? 'pointer' : 'not-allowed',
              opacity: accepted ? 1 : 0.8,
            }}
          >
            {confirmLabel}
          </button>
        </>
      )}
    >
      <div className="disclaimer-dialog__content">
        <p className="disclaimer-dialog__message">{message}</p>
        <label className="disclaimer-dialog__checkbox">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(event) => setAccepted(event.target.checked)}
          />
          <span>{checkboxLabel}</span>
        </label>
      </div>
    </Modal>
  );
};

export default DisclaimerDialog;
