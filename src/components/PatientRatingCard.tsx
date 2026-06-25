import React, { useState } from 'react';
import { ThumbsUp, ThumbsDown } from 'lucide-react';
import { supabase } from '../supabase';
import PatientGuidanceNotice from './PatientGuidanceNotice';

type PatientRatingCardProps = {
  guidanceNoticeText: string;
  practiceIdentifier: string;
};

// The rating is a simple "was this useful?" signal. We keep the existing
// 1-5 backend scale (submit_patient_rating) and map the binary answer onto
// it so the practice dashboard average stays meaningful: useful -> 5, not -> 1.
const USEFUL_VALUE = 5;
const NOT_USEFUL_VALUE = 1;

const PatientRatingCard: React.FC<PatientRatingCardProps> = ({ guidanceNoticeText, practiceIdentifier }) => {
  const [submittedValue, setSubmittedValue] = useState<number | null>(null);
  const [hasRated, setHasRated] = useState(false);
  const [isSubmittingRating, setIsSubmittingRating] = useState(false);
  const [ratingError, setRatingError] = useState<string | null>(null);

  const handleRating = async (value: number) => {
    if (hasRated || isSubmittingRating || !practiceIdentifier) return;
    setSubmittedValue(value);
    setRatingError(null);
    setIsSubmittingRating(true);
    try {
      const { data, error } = await supabase.rpc('submit_patient_rating', {
        org_name: practiceIdentifier,
        rating_value: value,
      });
      if (error) {
        throw error;
      }
      const result = data as { success?: boolean; error?: string } | null;
      if (result && result.success === false) {
        setRatingError(result.error || 'Unable to submit your feedback. Please try again later.');
        setSubmittedValue(null);
      } else {
        setHasRated(true);
      }
    } catch (err) {
      console.error('Failed to submit rating:', err);
      setRatingError('Unable to submit your feedback. Please try again later.');
      setSubmittedValue(null);
    }
    setIsSubmittingRating(false);
  };

  return (
    <>
      <div className="card hc-rating patient-feedback">
        <h2 className="patient-feedback__title">Did you find this information useful?</h2>
        {hasRated ? (
          <p className="patient-feedback__thanks" role="status">Thank you for your feedback.</p>
        ) : (
          <div className="patient-feedback__choices">
            <button
              type="button"
              onClick={() => handleRating(USEFUL_VALUE)}
              disabled={isSubmittingRating}
              aria-pressed={submittedValue === USEFUL_VALUE}
              className="patient-feedback__btn patient-feedback__btn--yes"
            >
              <ThumbsUp size={20} aria-hidden="true" />
              Yes, this was useful
            </button>
            <button
              type="button"
              onClick={() => handleRating(NOT_USEFUL_VALUE)}
              disabled={isSubmittingRating}
              aria-pressed={submittedValue === NOT_USEFUL_VALUE}
              className="patient-feedback__btn patient-feedback__btn--no"
            >
              <ThumbsDown size={20} aria-hidden="true" />
              No, not really
            </button>
          </div>
        )}
        {ratingError && !hasRated && (
          <p role="alert" className="patient-feedback__error">
            {ratingError}
          </p>
        )}
      </div>

      <div className="hc-rating__notice">
        <PatientGuidanceNotice text={guidanceNoticeText} />
      </div>
    </>
  );
};

export default PatientRatingCard;
