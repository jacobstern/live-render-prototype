import { LiveGateway } from '../live-render-express';
import { isEmail, isMobilePhone } from 'validator';

const gateway = new LiveGateway();

interface FormData {
  name: string;
  email: string;
  phoneNumber: string;
}

type FormDataValidations = { [k in keyof FormData]?: string };

function validateFormInputs(data: FormData): FormDataValidations | undefined {
  const validations: FormDataValidations = {};
  if (data.email && !isEmail(data.email)) {
    validations['email'] = 'This email is invalid';
  }
  if (data.phoneNumber && !isMobilePhone(data.phoneNumber, 'any')) {
    validations['phoneNumber'] = 'This phone number is invalid';
  }
  if (Object.keys(validations).length > 0) {
    return validations;
  }
}

gateway.on('ready', client => {
  client.on('formChange', message => {
    if (message.type !== 'formChange') {
      return;
    }
    const validationErrors = validateFormInputs(message.sender.data as any);
    client.update({ validationErrors });
  });
});

export default gateway;
