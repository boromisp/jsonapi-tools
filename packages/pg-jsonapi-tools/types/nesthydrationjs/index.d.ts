// Type definitions for nesthydrationjs 1.0.5
// Project: https://github.com/CoursePark/NestHydrationJS
// Definitions by: Peter Boromissza <https://github.com/boromisp>
// Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped
// TypeScript Version: 2.2

// for docs go to https://github.com/CoursePark/NestHydrationJS/tree/v1.0.6


declare module 'nesthydrationjs' {
    interface INestHydrationJS {
        nest(data: any, structPropToColumnMap?: any): any;
    }

    function nesthydrationjs(): INestHydrationJS;

    export = nesthydrationjs;
}
