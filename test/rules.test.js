/**
 * Rules regression suite.
 *
 * Runs against the compiled output, so `npm run build` first:
 *   npm run build && npm run test:rules
 *
 * These are the rules that quietly cost money when they drift - SSN and ABA
 * validity, ZIP-to-state, per-state licence formats, term availability, the
 * amount envelope, and the derived underwriting figures.
 */
const path = require('path').join(__dirname, '..', 'dist', 'common', 'utils') + require('path').sep;
const V = require(path + 'validators');
const S = require(path + 'us-states');
const L = require(path + 'loan-rules');

let pass = 0, fail = 0;
const t = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`}`);
  ok ? pass++ : fail++;
};

console.log('--- SSN (field 33) ---');
t('rejects area 000', V.isValidSsn('000-12-3456'), false);
t('rejects area 666', V.isValidSsn('666-12-3456'), false);
t('rejects area 900+', V.isValidSsn('900-12-3456'), false);
t('rejects group 00', V.isValidSsn('123-00-3456'), false);
t('rejects serial 0000', V.isValidSsn('123-45-0000'), false);
t('rejects publicized 078-05-1120', V.isValidSsn('078-05-1120'), false);
t('rejects sequential 123-45-6789 (publicized)', V.isValidSsn('123-45-6789'), false);
t('accepts valid 412-88-7431', V.isValidSsn('412-88-7431'), true);
t('masks to last 4 only', V.maskSsn('123456789'), 'XXX-XX-6789');

console.log('\n--- ABA routing checksum (field 43) ---');
t('Chase 021000021 valid', V.isValidRoutingNumber('021000021'), true);
t('BoA 026009593 valid', V.isValidRoutingNumber('026009593'), true);
t('Wells 121000248 valid', V.isValidRoutingNumber('121000248'), true);
t('bad checksum rejected', V.isValidRoutingNumber('021000022'), false);
t('all zeros rejected', V.isValidRoutingNumber('000000000'), false);
t('8 digits rejected', V.isValidRoutingNumber('02100002'), false);

console.log('\n--- Phone NPA/NXX (field 11) ---');
t('rejects 555 area', V.isValidUsPhone('5551234567'), false);
t('rejects 900 area', V.isValidUsPhone('9001234567'), false);
t('rejects N11 (411)', V.isValidUsPhone('4111234567'), false);
t('rejects NPA starting 1', V.isValidUsPhone('1231234567'), false);
t('rejects NXX starting 1', V.isValidUsPhone('2121234567'), false);
t('allows 555 NXX outside the 0100-0199 fictional block', V.isValidUsPhone('2125551212'), true);
t('rejects fictional 555-0100 block', V.isValidUsPhone('2125550142'), false);
t('accepts 2129876543', V.isValidUsPhone('2129876543'), true);

console.log('\n--- PO Box (field 13) ---');
t('rejects "PO Box 123"', V.isPoBox('PO Box 123'), true);
t('rejects "P.O. BOX 9"', V.isPoBox('P.O. BOX 9'), true);
t('allows street', V.isPoBox('123 Boxwood Lane'), false);

console.log('\n--- ZIP -> state (field 17) ---');
t('10001 is NY', S.isZipValidForState('10001', 'NY'), true);
t('10001 not TX', S.isZipValidForState('10001', 'TX'), false);
t('73301 is TX', S.isZipValidForState('73301', 'TX'), true);
t('90210 is CA', S.isZipValidForState('90210', 'CA'), true);
t('ZIP+4 rejected', S.isZipValidForState('100011234', 'NY'), false);

console.log('\n--- Driver licence patterns (field 35) ---');
t('CA A1234567 valid', S.isDriverLicenseValid('A1234567', 'CA'), true);
t('CA 12345678 invalid', S.isDriverLicenseValid('12345678', 'CA'), false);
t('FL F123456789012 valid', S.isDriverLicenseValid('F123456789012', 'FL'), true);
t('TX 12345678 valid', S.isDriverLicenseValid('12345678', 'TX'), true);

console.log('\n--- Term filtering (field 4) ---');
t('48mo suppressed under $5000', L.availableTerms(4500, 'TX'), [12, 24, 36]);
t('48mo allowed at $5000', L.availableTerms(5000, 'TX'), [12, 24, 36, 48]);
t('NY is now available', S.STATE_RULES.NY.licensed, true);
t('all 51 jurisdictions available', S.STATE_CODES.every(c => S.STATE_RULES[c].licensed), true);
const lowIncomeTerms = L.availableTerms(50000, 'TX', 2000, L.DEFAULT_APR, 0.15);
t('12mo suppressed when unaffordable', lowIncomeTerms.includes(12), false);
t('affordability leaves at least one term', lowIncomeTerms.length > 0, true);

console.log('\n--- Amount caps ---');
t('clamps to new $2000 floor', L.clampAmount(1000, 'CA'), 2000);
t('clamps to new $50000 ceiling', L.clampAmount(60000, 'IA'), 50000);
t('$500 step enforced', L.clampAmount(5200, 'TX'), 5000);

console.log('\n--- Derived fields ---');
const d = L.computeDerivedFields({
  dateOfBirth: '1990-06-15',
  netMonthlyIncome: 4000,
  additionalMonthlyIncome: 500,
  monthlyHousingPayment: 1200,
  bureauMonthlyObligations: 300,
  loanAmount: 5000,
  loanTermMonths: 36,
  apr: L.DEFAULT_APR,
  jobTenure: '1_2_years',
  residenceTenure: '3_5_years',
});
t('total monthly income', d.totalMonthlyIncome, 4500);
t('DTI = (1200+300)/4500', d.debtToIncomeRatio, 0.3333);
t('disposable = 4500-1200-300', d.disposableIncome, 3000);
t('job tenure midpoint months', d.jobTenureMonths, 18);
t('residence tenure midpoint months', d.residenceTenureMonths, 48);
t('flat APR is 10%', L.DEFAULT_APR, 10);
t('installment 5000/36mo @10%', d.estimatedInstallment, 161.34);
t('PTI ratio', d.paymentToIncomeRatio, 0.0359);

console.log('\n--- DOB (field 12) ---');
t('rejects under 18', V.isValidDob('2015-01-01'), false);
t('rejects future', V.isValidDob('2099-01-01'), false);
t('accepts adult', V.isValidDob('1990-06-15'), true);

console.log('\n--- Email ---');
t('blocks disposable', V.isDisposableEmail('a@mailinator.com'), true);
t('suggests gmail typo', V.suggestEmailCorrection('bob@gmai.com'), 'bob@gmail.com');
t('no suggestion for good domain', V.suggestEmailCorrection('bob@gmail.com'), null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
