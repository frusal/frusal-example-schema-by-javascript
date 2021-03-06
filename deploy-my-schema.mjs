#!/usr/bin/env node --unhandled-rejections=strict
// @ts-check

import { ActualWorkspace, ClassSpec, CollectionType, Flow, IntegerType, Inverse, InverseSide, Property, ReferenceType, session, StringType, Transaction } from 'frusal';
import fs from 'fs';

const COMMON_DESCRIPTION = 'Created and maintained by deploy-my-schema.js';

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

async function main() {
    const frusalJson = JSON.parse(fs.readFileSync('./frusal.json').toString());
    try {
        if (!session.user) {
            console.warn('Please use `npx frusal login` to login to frusal.com workspace.');

        } else {
            console.log(`Connecting to workspace "${frusalJson.workspace}"...`);
            await session.login({ workspace: frusalJson.workspace });

            if (!session.workspace) {
                console.warn('Please use `npx frusal login` to select a workspace.');

            } else {
                await session.workspace.withTempStageAsyncExpression(async stage => {
                    const actualWorkspace = stage.transact(tx => tx.getSingletonInstance(ActualWorkspace));
                    const module = actualWorkspace.modules.find(m => !m.system);
                    console.log(`Creating classes at module "${module.name}"...`);

                    // Schema
                    await stage.transact(async tx => {
                        // Delete old classes and types
                        [...module.classes, ...module.types].filter(c => c.description === COMMON_DESCRIPTION).forEach(c => c.delete());

                        // Create new ones
                        createSchema(tx);
                    });

                    // Data
                    await stage.transact(async tx => {
                        createData(tx);
                    });

                });
                console.log('Schema changes deployed.');
            }
        }
    } finally {
        console.warn('Closing session.');
        await session.close();
    }
    console.warn('Buy.');
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/** @param {Transaction} tx */
function createSchema(tx) {
    const actualWorkspace = tx.getSingletonInstance(ActualWorkspace);
    const module = actualWorkspace.modules.find(m => !m.system);
    Flow.checkThat(module != null);

    const stringType = tx.createEntity(StringType);
    stringType.name = 'String';
    stringType.description = COMMON_DESCRIPTION;
    stringType.module = module;
    const numericType = tx.createEntity(IntegerType);
    numericType.name = 'Numeric';
    numericType.description = COMMON_DESCRIPTION;
    numericType.module = module;

    // Create classes upfront to address a problem of circular reference which makes sequential creation impossible.
    const namedEntityClass = tx.createEntity(ClassSpec);
    const productClass = tx.createEntity(ClassSpec);
    const orderClass = tx.createEntity(ClassSpec);
    const orderLineClass = tx.createEntity(ClassSpec);
    const orderToOrderLineInverse = tx.createEntity(Inverse);

    // class NamedEntity { name: string }
    {
        namedEntityClass.name = 'Named Entity';
        namedEntityClass.description = COMMON_DESCRIPTION;
        namedEntityClass.abstract = true;

        const namedEntityNameProp = tx.createEntity(Property);
        namedEntityNameProp.name = 'Name';
        namedEntityNameProp.description = 'The entity name. (e.g., Product Name, Order Number, etc)';
        namedEntityNameProp.type = stringType;
        namedEntityNameProp.classSpec = namedEntityClass; // this is an inverse property to class.fields, which means this action would add it to that collection.
        namedEntityClass.module = module; // an inverse to module.classes collection.
    }

    // class Product extends NamedEntity { price: numeric }
    {
        productClass.name = 'Product';
        productClass.description = COMMON_DESCRIPTION;
        productClass.ancestor = namedEntityClass;
        productClass.store = module.defaultLookupStore;

        const productPriceProp = tx.createEntity(Property);
        productPriceProp.name = 'Price';
        productPriceProp.description = 'The price per unit.';
        productPriceProp.type = numericType;
        productPriceProp.classSpec = productClass;
        productClass.module = module; // an inverse to module.classes collection.
    }

    // class Order extends NamedEntity { deliveryAddress: string, lines: OrderLines[] }
    {
        orderClass.name = 'Order';
        orderClass.description = COMMON_DESCRIPTION;
        orderClass.ancestor = namedEntityClass;

        const orderOrderLineProp = tx.createEntity(Property);
        orderOrderLineProp.name = 'Order Lines';
        orderOrderLineProp.description = 'The Collection of order lines, which links the products and quantities to this order.';
        orderOrderLineProp.inverse = orderToOrderLineInverse; // inverse references automatically update the other end.
        orderOrderLineProp.inverseSide = tx.createEntity(InverseSide);
        const orderOrderLineType = tx.createEntity(CollectionType);
        orderOrderLineType.elementClass = orderLineClass;
        orderOrderLineProp.type = orderOrderLineType;
        orderOrderLineProp.classSpec = orderClass;

        const orderDeliveryAddressProp = tx.createEntity(Property);
        orderDeliveryAddressProp.name = 'Delivery Address';
        orderDeliveryAddressProp.description = 'The Delivery address for the order.';
        orderDeliveryAddressProp.type = stringType;
        orderDeliveryAddressProp.classSpec = orderClass;
        orderClass.module = module; // an inverse to module.classes collection.
    }

    // class OrderLine { order: Order, product: Product, quantity: numeric }
    {
        orderLineClass.name = 'Order Line';
        orderLineClass.description = COMMON_DESCRIPTION;
        orderLineClass.ancestor = namedEntityClass;

        const orderLineOrderProp = tx.createEntity(Property);
        orderLineOrderProp.name = 'Order';
        orderLineOrderProp.description = 'The Order this line belongs to.';
        orderLineOrderProp.inverse = orderToOrderLineInverse;
        orderLineOrderProp.inverseSide = tx.createEntity(InverseSide);
        const orderLineOrderType = tx.createEntity(ReferenceType);
        orderLineOrderType.elementClass = orderClass;
        orderLineOrderProp.type = orderLineOrderType;
        orderLineOrderProp.classSpec = orderLineClass;

        const orderLineProductProp = tx.createEntity(Property);
        orderLineProductProp.name = 'Product';
        orderLineProductProp.description = 'The Product this line orders with quantity.';
        const orderLineProductType = tx.createEntity(ReferenceType);
        orderLineProductType.elementClass = productClass;
        orderLineProductProp.type = orderLineProductType;
        orderLineProductProp.classSpec = orderLineClass;

        const orderLineQuantityProp = tx.createEntity(Property);
        orderLineQuantityProp.name = 'Quantity';
        orderLineQuantityProp.description = 'The Quantity of product to be delivered.';
        orderLineQuantityProp.type = numericType;
        orderLineQuantityProp.classSpec = orderLineClass;
        orderLineClass.module = module; // an inverse to module.classes collection.
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/** @param {Transaction} tx */
function createData(tx) {
    ['Pineapple', 'Rockmelon', 'Watermelon', 'Strawberries', 'Green grapes', 'Red grapes', 'Passionfruit', 'Lime juice'].forEach(name => {
        const product = tx.createEntity("Product"); // Referencing class by name string, therefore no type checking for the instance reference.
        product.name = name;
    });
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

main();
