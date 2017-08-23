import React from 'react'
import renderer from 'react-test-renderer'
import Home from '../../src/components/Home'

describe('Test components', () => {

    it('Test home component', () => {

        const home = renderer.create(
            <Home></Home>
        ).toJSON()

        expect(home.props).toEqual({})

    })
})



