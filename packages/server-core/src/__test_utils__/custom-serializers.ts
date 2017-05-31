import CustomError from '../utils/custom-error';

export default [{
    print: (error: CustomError, serialize: any) => (
        '[' + error.toString() + ', status: ' + serialize(error.status) + ']'
    ),
    test: (val: any) => val && val instanceof CustomError
}];
