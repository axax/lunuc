import React from 'react'
import GenericForm from '../components/generic/GenericForm'
import {Pagination} from 'ui'
import update from 'immutability-helper'
import genericComposer from './generic/genericComposer'
import {Link} from 'react-router-dom'
import BaseLayout from '../components/layout/BaseLayout'
import logger from '../../util/logger'
import PropTypes from 'prop-types'
import {Table, DeleteIconButton} from 'ui'
import Util from 'client/util'

const CMS_PAGES_PER_PAGE = 10


class CmsContainer extends React.Component {
    static logger = logger(CmsContainer.name)

    state = {
        rowsPerPage: CMS_PAGES_PER_PAGE
    }

    render() {
        const {cmsPages} = this.props

        if (!cmsPages)
            return <BaseLayout />

        const columns = [
                {
                    title: 'Slug',
                    dataIndex: 'slug'
                },
                {
                    title: 'User',
                    dataIndex: 'user'
                },
                {
                    title: 'Created at',
                    dataIndex: 'date'
                },
                {
                    title: 'Actions',
                    dataIndex: 'action'
                }],
            dataSource = cmsPages.results && cmsPages.results.map((cmsPage) => ({
                    slug: <span onBlur={(e) => this.handleCmsPageChange.bind(this)(e, cmsPage, 'slug')}
                                suppressContentEditableWarning contentEditable>{cmsPage.slug}</span>,
                    user: cmsPage.createdBy.username,
                    date: Util.formattedDateFromObjectId(cmsPage._id),
                    action: <div>
                        <Link
                            to={'/cms/view/' + cmsPage.slug}> View</Link>

                        <DeleteIconButton disabled={(cmsPage.status == 'deleting' || cmsPage.status == 'updating')}
                                          onClick={this.handleDeleteCmsPageClick.bind(this, cmsPage)}>Delete</DeleteIconButton>
                    </div>
                }))


        const totalPages = Math.ceil(cmsPages.total / CMS_PAGES_PER_PAGE),
            currentPage = Math.ceil(cmsPages.offset / CMS_PAGES_PER_PAGE) + 1
        return (
            <BaseLayout>
                <h1>Cms Pages</h1>
                <GenericForm fields={{slug: {value: '', placeholder: 'slug name'}}}
                             onClick={this.handleAddCmsPageClick}/>


                <Table dataSource={dataSource} columns={columns} count={totalPages}
                       rowsPerPage={this.state.rowsPerPage} page={currentPage}
                       onChangePage={this.handleChangePage.bind(this)}
                       onChangeRowsPerPage={this.handleChangeRowsPerPage.bind(this)}/>


            </BaseLayout>
        )
    }


    handleAddCmsPageClick = (data) => {
        const {createCmsPage} = this.props
        createCmsPage(data)
    }

    handleCmsPageChange = (event, data, key) => {

        const t = event.target.innerText.trim()
        if (t != data[key]) {
            const {updateCmsPage} = this.props
            updateCmsPage(
                update(data, {[key]: {$set: t}})
            )
        }
    }

    handleDeleteCmsPageClick = (data) => {
        const {deleteCmsPage} = this.props
        deleteCmsPage({
            _id: data._id
        })
    }


    handleChangePage = (page) => {
        this.props.history.push(`/cms/${(page)}`)
    }


    handleChangeRowsPerPage = (rowsPerPage) => {
        this.setState({rowsPerPage})
        this.props.setOptionsForCmsPages({limit: rowsPerPage})
        this.props.refetchCmsPages()
    }
}


CmsContainer.propTypes = {
    cmsPages: PropTypes.object,
    createCmsPage: PropTypes.func.isRequired,
    updateCmsPage: PropTypes.func.isRequired,
    deleteCmsPage: PropTypes.func.isRequired,
    refetchCmsPages: PropTypes.func.isRequired,
    setOptionsForCmsPages: PropTypes.func.isRequired,
    loading: PropTypes.bool
}


export default genericComposer(CmsContainer, 'cmsPage', {fields: {'slug': 'String!'}, limit: CMS_PAGES_PER_PAGE})

