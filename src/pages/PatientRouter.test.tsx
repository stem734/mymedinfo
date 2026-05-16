import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import PatientRouter from './PatientRouter';

vi.mock('./ResourceView', () => ({
  default: () => <div>Resource View</div>,
}));

vi.mock('./CombinedPatientView', () => ({
  default: () => <div>Combined View</div>,
}));

vi.mock('./HealthCheckView', () => ({
  default: () => <div>Health Check View</div>,
}));

vi.mock('./ScreeningView', () => ({
  default: () => <div>Screening View</div>,
}));

vi.mock('./ImmunisationView', () => ({
  default: () => <div>Immunisation View</div>,
}));

vi.mock('./LongTermConditionView', () => ({
  default: () => <div>Long Term Condition View</div>,
}));

const renderRouter = (entry: string) =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/patient" element={<PatientRouter />} />
      </Routes>
    </MemoryRouter>,
  );

describe('PatientRouter', () => {
  it('routes screening links that use codes with an explicit screening type', async () => {
    renderRouter('/patient?type=screening&org=Riverside&codes=cervical');

    expect(await screen.findByText('Screening View')).toBeInTheDocument();
  });

  it('routes immunisation links that use codes with an explicit immunisation type', async () => {
    renderRouter('/patient?type=imms&org=Riverside&codes=flu,covid');

    expect(await screen.findByText('Immunisation View')).toBeInTheDocument();
  });

  it('routes long term condition links that use codes with an explicit ltc type', async () => {
    renderRouter('/patient?type=ltc&org=Riverside&codes=asthma');

    expect(await screen.findByText('Long Term Condition View')).toBeInTheDocument();
  });

  it('still treats plain codes links as medication when no explicit type is present', async () => {
    renderRouter('/patient?org=Riverside&codes=101,201');

    expect(await screen.findByText('Resource View')).toBeInTheDocument();
  });

  it('routes mixed codes links to the combined view when medication and screening tokens are present', async () => {
    renderRouter('/patient?org=Riverside&codes=102,101,302,201,CS1,BR1');

    expect(await screen.findByText('Combined View')).toBeInTheDocument();
  });
});
