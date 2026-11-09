import React from 'react';
import { View, Text, TextInput, StyleSheet, TextInputProps } from 'react-native';
import { Lock } from 'lucide-react-native';
import type { PayoutFormField, PayoutFormValues } from '../utils/payoutValidation';

interface PayoutFormFieldsProps {
  values: PayoutFormValues;
  onChange: (patch: Partial<PayoutFormValues>) => void;
  /** 'full' = first-time setup (identity + bank + address); 'bank' = change bank account only. */
  mode: 'full' | 'bank';
  errorField?: PayoutFormField | null;
  editable?: boolean;
}

export const PayoutReassurance: React.FC = () => (
  <View style={styles.reassurance}>
    <Lock size={16} color="#34D399" />
    <Text style={styles.reassuranceText}>
      These details go straight to Razorpay, our payments partner, to pay you after each gig. Stagely
      never stores your PAN or your full account number.
    </Text>
  </View>
);

export const PayoutFormFields: React.FC<PayoutFormFieldsProps> = ({
  values,
  onChange,
  mode,
  errorField,
  editable = true
}) => {
  const field = (
    key: PayoutFormField,
    label: string,
    props: TextInputProps = {}
  ) => (
    <View style={styles.inputGroup} key={key}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, errorField === key && styles.inputError]}
        placeholderTextColor="#475569"
        value={values[key]}
        onChangeText={text => onChange({ [key]: text } as Partial<PayoutFormValues>)}
        editable={editable}
        {...props}
      />
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.sectionLabel}>Bank account</Text>
      {field('legalName', 'Legal name (as on bank account) *', {
        placeholder: 'e.g. Ravi Kumar Reddy',
        autoCapitalize: 'words',
        autoComplete: 'name'
      })}
      {field('accountNumber', 'Account number *', {
        placeholder: '9 to 18 digits',
        keyboardType: 'number-pad',
        secureTextEntry: false,
        autoCorrect: false,
        maxLength: 22
      })}
      {field('confirmAccountNumber', 'Confirm account number *', {
        placeholder: 'Re-enter account number',
        keyboardType: 'number-pad',
        autoCorrect: false,
        maxLength: 22,
        contextMenuHidden: true
      })}
      {field('ifsc', 'IFSC code *', {
        placeholder: 'e.g. HDFC0001234',
        autoCapitalize: 'characters',
        autoCorrect: false,
        maxLength: 11
      })}

      {mode === 'full' && (
        <>
          <Text style={styles.sectionLabel}>Identity & contact</Text>
          {field('pan', 'PAN *', {
            placeholder: 'e.g. ABCPE1234F',
            autoCapitalize: 'characters',
            autoCorrect: false,
            maxLength: 10
          })}
          {field('email', 'Email *', {
            placeholder: 'you@example.com',
            keyboardType: 'email-address',
            autoCapitalize: 'none',
            autoCorrect: false
          })}
          {field('phone', 'Mobile number *', {
            placeholder: '10-digit mobile',
            keyboardType: 'phone-pad',
            maxLength: 16
          })}

          <Text style={styles.sectionLabel}>Address</Text>
          {field('street1', 'Address line 1 *', { placeholder: 'House / flat, street' })}
          {field('street2', 'Address line 2 (optional)', { placeholder: 'Area, landmark' })}
          <View style={styles.row}>
            <View style={{ flex: 1 }}>{field('city', 'City *', { placeholder: 'Hyderabad' })}</View>
            <View style={{ flex: 1 }}>{field('state', 'State *', { placeholder: 'Telangana' })}</View>
          </View>
          {field('postalCode', 'PIN code *', {
            placeholder: '500001',
            keyboardType: 'number-pad',
            maxLength: 6
          })}
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 14
  },
  sectionLabel: {
    color: '#F5A623',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 6
  },
  inputGroup: {
    gap: 6
  },
  label: {
    color: '#CBD5E1',
    fontSize: 13,
    fontWeight: '600'
  },
  input: {
    backgroundColor: '#131722',
    borderColor: '#1E293B',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#FFFFFF',
    fontSize: 15
  },
  inputError: {
    borderColor: '#EF4444'
  },
  row: {
    flexDirection: 'row',
    gap: 12
  },
  reassurance: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    backgroundColor: '#06281E',
    borderColor: '#059669',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12
  },
  reassuranceText: {
    flex: 1,
    color: '#A7F3D0',
    fontSize: 12,
    lineHeight: 17
  }
});

export default PayoutFormFields;
