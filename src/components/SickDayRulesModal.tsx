import React from 'react';
import Modal from './Modal';
import WarningCallout from './WarningCallout';

type SickDayRulesModalProps = {
  isOpen: boolean;
  onClose: () => void;
  variant?: SickDayRulesVariant;
};

export type SickDayRulesVariant = 'standard' | 'insulin';

const SICK_DAY_RULES = [
  'Stop this medicine if you have been sick (vomiting) or had diarrhoea for more than 24 hours.',
  'While you are not taking this medicine, try to drink plenty of fluids and eat simple foods until you feel better.',
  'Start taking your medicine again once you have been eating and drinking normally for 24-48 hours.',
  'Do not take extra tablets to make up for missed doses. Restart at your normal dose.',
];

const INSULIN_SICK_DAY_RULES = [
  'Never stop your insulin. Your units may need adjusting but the amount can vary for each person. Discuss this with your healthcare professional.',
  'Check your blood glucose levels more frequently (every 2-4 hours) as you are more susceptible to hypos (low blood sugar).',
  'Check your ketone levels if your blood glucose is above 14mmol/L.',
  'While you are unwell, try to stay hydrated and eat plain foods until you are feeling better.',
  'If you are struggling to eat solid food and need carbohydrates, you can use liquids such as sugary drinks, milk or soup.',
];

const SickDayRulesModal: React.FC<SickDayRulesModalProps> = ({ isOpen, onClose, variant = 'standard' }) => (
  <Modal
    isOpen={isOpen}
    onClose={onClose}
    size="md"
    title="Sick Day Rules"
    closeOnOverlayClick={false}
    footer={
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button type="button" onClick={onClose} className="action-button" style={{ backgroundColor: '#4c6272' }}>
          Close
        </button>
      </div>
    }
  >
    <WarningCallout title="Important">
      <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
        {(variant === 'insulin' ? INSULIN_SICK_DAY_RULES : SICK_DAY_RULES).map((rule) => (
          <li key={rule} style={{ marginBottom: '0.65rem' }}>
            {rule}
          </li>
        ))}
      </ul>
    </WarningCallout>
  </Modal>
);

export default SickDayRulesModal;
