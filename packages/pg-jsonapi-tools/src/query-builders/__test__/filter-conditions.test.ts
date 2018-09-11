import "jest";

import PostgresModel from "../../postgres-model";
import ColumnMap from "../../column-map";
import generateSelect, {  } from "../generate-select";
import { IJoinRelationship } from "../../types/joins";

describe("Test", () => {
  test("Test 1", () => {

    const model = new PostgresModel(
      {
        type: "zones",
        getModel(): PostgresModel {
          return model;
        },
        attributes: ["number", "place"],
        relationships: {
          customer: {
            type: "customers",
            getModel(): PostgresModel {
              return model2;
            },
            sqlJoin: (zones: string, customers: string) =>
              `${zones}.customer_ref = ${customers}.id`
          } as IJoinRelationship
        }
      },
      "zones",
      new ColumnMap({
        number: "number",
        place: "place",
        customer: "customer_ref"
      })
    );

    const model2 = new PostgresModel(
      {
        type: "customers",
        getModel(): PostgresModel {
          return model2;
        },
        attributes: ["name", "account"]
      },
      "customers",
      new ColumnMap({
        name: "name",
        account: "account"
      })
    );

    const [query, params] = generateSelect({
      fields: null,
      sorts: null,
      filters: {
        number: { ne: "002" },
        place: { null: "false" },
        customer: { null: "false" },
        "customer.account": { pattern: "A%" }
      },
      includes: { customer: {} },
      restricted: false,
      modelOptions: model
    });

    expect(query).toMatchInlineSnapshot(`
"SELECT
  zones__main.\\"id\\"::text AS _id,
  zones__main.\\"number\\" AS _number,
  zones__main.\\"place\\" AS _place,
  zones__main.\\"customer_ref\\" AS _customer,
  \\"zones.customer\\".\\"id\\"::text AS _customer_id,
  \\"zones.customer\\".\\"name\\" AS _customer_name,
  \\"zones.customer\\".\\"account\\" AS _customer_account
FROM zones AS zones__main
LEFT JOIN customers AS \\"zones.customer\\" ON zones__main.customer_ref = \\"zones.customer\\".id
WHERE zones__main.\\"number\\" <> $<number__ne>
  AND zones__main.\\"place\\" IS NOT NULL
  AND zones__main.\\"customer_ref\\" IS NOT NULL
  AND (\\"zones.customer\\".\\"account\\"::text ILIKE $<customer_account__pattern>);"
`);
    expect(params).toMatchInlineSnapshot(`
Object {
  "customer_account__pattern": "A%",
  "number__ne": "002",
}
`);
  });
});
